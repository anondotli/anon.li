"use server"

import { auth } from "@/auth"
import { auth as betterAuth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { cookies, headers } from "next/headers"
import { TwoFactorService } from "@/lib/services/two-factor"
import { rateLimit } from "@/lib/rate-limit"
import { prisma } from "@/lib/prisma"
import { APIError } from "@better-auth/core/error"

type TwoFactorActionResult = {
    error?: string
    success?: boolean
}

type TwoFactorSetupResult = TwoFactorActionResult & {
    secret?: string
    qrCodeDataUrl?: string
    backupCodes?: string[]
}

type TwoFactorStatusResult = TwoFactorActionResult & {
    enabled?: boolean
}

type BackupCodesResult = TwoFactorActionResult & {
    backupCodes?: string[]
}

function mapApiError(error: unknown): string {
    if (error instanceof APIError) {
        const code = (error as APIError & { code?: string }).code
        switch (code) {
            case "INVALID_CODE": return "Invalid verification code"
            case "TOTP_NOT_ENABLED": return "2FA setup not initiated"
            case "INVALID_BACKUP_CODE": return "Invalid backup code"
            case "INVALID_TWO_FACTOR_COOKIE": return "Session expired. Please sign in again."
            default: return error.message || "Verification failed"
        }
    }
    if (error instanceof Error) return error.message
    return "Verification failed"
}

/**
 * Initiates 2FA setup and returns the QR code and backup codes.
 */
export async function initiateTwoFactorSetup(): Promise<TwoFactorSetupResult> {
    const session = await auth()
    if (!session?.user?.id) return { error: "Not authenticated" }

    try {
        const result = await TwoFactorService.initiateSetup(session.user.id)
        return {
            success: true,
            ...result
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to initiate 2FA setup"
        return { error: message }
    }
}

/**
 * Verifies the TOTP code and enables 2FA via Better Auth's verifyTOTP endpoint.
 */
export async function verifyAndEnableTwoFactor(code: string): Promise<TwoFactorActionResult> {
    const session = await auth()
    if (!session?.user?.id) return { error: "Not authenticated" }

    // Rate limit 2FA verification attempts
    const rateLimited = await rateLimit("twoFactorVerify", session.user.id)
    if (rateLimited) {
        return { error: "Too many verification attempts. Please wait 15 minutes and try again." }
    }

    // Sanitize code — setup only accepts TOTP (6 digits)
    const sanitizedCode = code.replace(/\s/g, "").slice(0, 6)
    if (!/^\d{6}$/.test(sanitizedCode)) {
        return { error: "Invalid code format. Enter 6 digits." }
    }

    try {
        if (!session.user.twoFactorEnabled) {
            // Our custom setup flow creates the TOTP record before verification.
            // Force it into Better Auth's "pending verification" state so the
            // verifyTOTP endpoint can enable 2FA and flip the flag back to true.
            await prisma.twoFactor.updateMany({
                where: { userId: session.user.id },
                data: { verified: false },
            })
        }

        await betterAuth.api.verifyTOTP({
            body: { code: sanitizedCode },
            headers: await headers(),
        })
        revalidatePath("/dashboard")
        return { success: true }
    } catch (error: unknown) {
        return { error: mapApiError(error) }
    }
}

/**
 * Checks if 2FA is enabled for the current user.
 */
export async function getTwoFactorStatus(): Promise<TwoFactorStatusResult> {
    const session = await auth()
    if (!session?.user?.id) return { error: "Not authenticated" }

    try {
        const enabled = await TwoFactorService.isEnabled(session.user.id)
        return { success: true, enabled }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to check 2FA status"
        return { error: message }
    }
}

/**
 * Disables 2FA for the current user. Verifies code via Better Auth first.
 */
export async function disableTwoFactor(code: string): Promise<TwoFactorActionResult> {
    const session = await auth()
    if (!session?.user?.id) return { error: "Not authenticated" }

    // Rate limit 2FA verification attempts
    const rateLimited = await rateLimit("twoFactorVerify", session.user.id)
    if (rateLimited) {
        return { error: "Too many verification attempts. Please wait 15 minutes and try again." }
    }

    const sanitizedCode = code.replace(/\s/g, "")

    try {
        // Try TOTP first, fall back to backup code if format matches
        if (/^\d{6}$/.test(sanitizedCode)) {
            await betterAuth.api.verifyTOTP({
                body: { code: sanitizedCode },
                headers: await headers(),
            })
        } else {
            await betterAuth.api.verifyBackupCode({
                body: { code: sanitizedCode },
                headers: await headers(),
            })
        }

        await TwoFactorService.disable(session.user.id)
        revalidatePath("/dashboard")
        return { success: true }
    } catch (error: unknown) {
        return { error: mapApiError(error) }
    }
}

/**
 * Regenerates backup codes. Verifies code via Better Auth first.
 */
export async function regenerateBackupCodes(code: string): Promise<BackupCodesResult> {
    const session = await auth()
    if (!session?.user?.id) return { error: "Not authenticated" }

    // Rate limit 2FA verification attempts
    const rateLimited = await rateLimit("twoFactorVerify", session.user.id)
    if (rateLimited) {
        return { error: "Too many verification attempts. Please wait 15 minutes and try again." }
    }

    const sanitizedCode = code.replace(/\s/g, "")

    try {
        // Try TOTP first, fall back to backup code if format matches
        if (/^\d{6}$/.test(sanitizedCode)) {
            await betterAuth.api.verifyTOTP({
                body: { code: sanitizedCode },
                headers: await headers(),
            })
        } else {
            await betterAuth.api.verifyBackupCode({
                body: { code: sanitizedCode },
                headers: await headers(),
            })
        }

        const backupCodes = await TwoFactorService.regenerateBackupCodes(session.user.id)
        return { success: true, backupCodes }
    } catch (error: unknown) {
        return { error: mapApiError(error) }
    }
}

/**
 * Verifies a TOTP or backup code server-side and, on success, marks the current
 * session as 2FA-verified.
 *
 * better-auth's verify-totp endpoint validates the code but does NOT update
 * twoFactorVerified on existing sessions (its hook only covers email/password
 * sign-in, not magic link or OAuth). This action both verifies the code and
 * flips the flag in a single server-trusted operation, so callers cannot skip
 * the verification step by invoking a separate "finalize" endpoint.
 */
export async function verifyTwoFactorLogin(
    code: string,
    mode: "totp" | "backup"
): Promise<TwoFactorActionResult> {
    const reqHeaders = await headers()
    const result = await betterAuth.api.getSession({ headers: reqHeaders })
    if (!result?.session || !result?.user) return { error: "Not authenticated" }
    if (!result.user.twoFactorEnabled) return { error: "2FA is not enabled" }

    const rateLimited = await rateLimit("twoFactorVerify", result.user.id)
    if (rateLimited) {
        return { error: "Too many verification attempts. Please wait 15 minutes and try again." }
    }

    const sanitized = code.replace(/\s/g, "")

    try {
        if (mode === "totp") {
            const totpCode = sanitized.slice(0, 6)
            if (!/^\d{6}$/.test(totpCode)) {
                return { error: "Invalid code format. Enter 6 digits." }
            }
            await betterAuth.api.verifyTOTP({
                body: { code: totpCode },
                headers: reqHeaders,
            })
        } else {
            const backupCode = sanitized.slice(0, 17)
            if (!/^[A-Za-z0-9]{5}-[A-Za-z0-9]{11}$/.test(backupCode)) {
                return { error: "Invalid backup code format." }
            }
            await betterAuth.api.verifyBackupCode({
                body: { code: backupCode },
                headers: reqHeaders,
            })
        }
    } catch (error: unknown) {
        return { error: mapApiError(error) }
    }

    await prisma.session.update({
        where: { id: result.session.id },
        data: { twoFactorVerified: true },
    })

    const cookieStore = await cookies()
    cookieStore.delete("better-auth.session_data")

    return { success: true }
}
