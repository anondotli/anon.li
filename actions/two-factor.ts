"use server"

import { auth } from "@/auth"
import { auth as betterAuth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { cookies, headers } from "next/headers"
import { TwoFactorService } from "@/lib/services/two-factor"
import { rateLimit } from "@/lib/rate-limit"
import { prisma } from "@/lib/prisma"
import { APIError } from "@better-auth/core/error"

/**
 * These actions intentionally DO NOT use the runSecureAction/runScopedAction
 * wrappers. The wrappers reject when a session has 2FA enabled but not yet
 * verified (requiresTwoFactorChallenge) — which is exactly the state these
 * actions exist to resolve: verifyTwoFactorLogin runs during the login
 * challenge (often with no full session yet), and disable/regenerate run on an
 * enabled-but-unverified session. They also need bespoke per-attempt rate
 * limiting, better-auth error mapping, and custom result shapes. So auth is
 * hand-rolled here by design.
 */

type TwoFactorActionResult = {
    error?: string
    success?: boolean
    redirectTo?: string
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

type VerifyTwoFactorResponse = {
    token?: string
}

const TWO_FACTOR_COOKIE_NAMES = ["better-auth.two_factor", "__Secure-better-auth.two_factor"] as const
const SESSION_DATA_COOKIE_NAMES = ["better-auth.session_data", "__Secure-better-auth.session_data"] as const

async function hasPendingTwoFactorCookie(): Promise<boolean> {
    const cookieStore = await cookies()
    return TWO_FACTOR_COOKIE_NAMES.some((name) => Boolean(cookieStore.get(name)?.value))
}

async function clearSessionCacheCookie() {
    const cookieStore = await cookies()
    for (const name of SESSION_DATA_COOKIE_NAMES) {
        cookieStore.delete(name)
    }
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
    const existingSession = await betterAuth.api.getSession({ headers: reqHeaders })

    if (existingSession?.session && existingSession.user) {
        const twoFactorEnabled = await TwoFactorService.isEnabled(existingSession.user.id)
        if (!twoFactorEnabled) return { error: "2FA is not enabled" }

        // Step-up re-verification for an already-authenticated session: a tight
        // per-account ceiling. (The verifyTOTP/verifyBackupCode calls below also
        // pass through the global per-IP before-hook in lib/auth.ts.)
        const rateLimited = await rateLimit("twoFactorVerify", existingSession.user.id)
        if (rateLimited) {
            return { error: "Too many verification attempts. Please wait 15 minutes and try again." }
        }
    } else {
        // Pending login (first factor passed, no full session yet). We require a
        // pending-2FA cookie to be present, but deliberately do NOT key the rate
        // limit on it — an attacker can mint a fresh cookie by re-triggering the
        // challenge, which would reset a cookie-keyed bucket and defeat the
        // brute-force ceiling. The per-IP ceiling is enforced in the global
        // before-hook (lib/auth.ts, twoFactorVerifyIp), which fires on the
        // auth.api.verifyTOTP / verifyBackupCode calls below.
        if (!(await hasPendingTwoFactorCookie())) return { error: "Not authenticated" }
    }

    const sanitized = code.replace(/\s/g, "")

    let verification: VerifyTwoFactorResponse
    try {
        if (mode === "totp") {
            const totpCode = sanitized.slice(0, 6)
            if (!/^\d{6}$/.test(totpCode)) {
                return { error: "Invalid code format. Enter 6 digits." }
            }
            verification = await betterAuth.api.verifyTOTP({
                body: { code: totpCode },
                headers: reqHeaders,
            }) as VerifyTwoFactorResponse
        } else {
            const backupCode = sanitized.slice(0, 17)
            if (!/^[A-Za-z0-9]{5}-[A-Za-z0-9]{11}$/.test(backupCode)) {
                return { error: "Invalid backup code format." }
            }
            verification = await betterAuth.api.verifyBackupCode({
                body: { code: backupCode },
                headers: reqHeaders,
            }) as VerifyTwoFactorResponse
        }
    } catch (error: unknown) {
        return { error: mapApiError(error) }
    }

    const sessionWhere = existingSession?.session
        ? { id: existingSession.session.id }
        : verification.token
            ? { token: verification.token }
            : null

    if (!sessionWhere) return { error: "Verification failed" }

    const updatedSession = await prisma.session.update({
        where: sessionWhere,
        data: { twoFactorVerified: true },
        select: { userId: true },
    })
    await clearSessionCacheCookie()

    const security = await prisma.userSecurity.findUnique({
        where: { userId: updatedSession.userId },
        select: { id: true },
    })
    const redirectTo = security ? "/dashboard/alias" : "/setup"

    return { success: true, redirectTo }
}
