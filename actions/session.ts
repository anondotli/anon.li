"use server"

import { prisma } from "@/lib/prisma"
import { runSecureAction, type ActionState } from "@/lib/safe-action"
import { revalidatePath } from "next/cache"
import { createLogger } from "@/lib/logger"
import { cookies, headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getClientIp, rateLimit } from "@/lib/rate-limit"
import { normalizeEmail } from "@/lib/vault/server"

const logger = createLogger("SessionActions")
const PASSWORD_RESET_SUCCESS_MESSAGE = "If this email exists in our system, check your email for the reset link."

export async function requestPasswordResetAction(email: string): Promise<ActionState<{ message: string }>> {
    const normalizedEmail = normalizeEmail(email)

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
        return { error: "Enter a valid email address" }
    }

    try {
        const clientIp = await getClientIp()
        const [ipLimited, emailLimited] = await Promise.all([
            rateLimit("passwordReset", clientIp),
            rateLimit("passwordResetEmail", normalizedEmail),
        ])

        if (ipLimited || emailLimited) {
            logger.warn("Password reset request rate limited", { email: normalizedEmail })
            return {
                success: true,
                data: { message: PASSWORD_RESET_SUCCESS_MESSAGE },
            }
        }

        await auth.api.requestPasswordReset({
            headers: await headers(),
            body: {
                email: normalizedEmail,
                redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset`,
            },
        })
    } catch (error) {
        logger.error("Password reset request failed", error, { email: normalizedEmail })
    }

    return {
        success: true,
        data: { message: PASSWORD_RESET_SUCCESS_MESSAGE },
    }
}

/**
 * Revoke a specific session (sign out a device)
 */
export async function revokeSessionAction(sessionId: string): Promise<ActionState> {
    return runSecureAction(
        { rateLimitKey: "auth" },
        async (_data, userId) => {
            const session = await prisma.session.findUnique({
                where: { id: sessionId },
                select: { userId: true },
            })

            if (!session || session.userId !== userId) {
                throw new Error("Session not found")
            }

            await prisma.session.delete({ where: { id: sessionId } })

            logger.info("Session revoked", { userId, sessionId })
            revalidatePath("/dashboard/settings")
        },
    )
}

/**
 * Revoke all other sessions (sign out all other devices)
 */
export async function revokeAllOtherSessionsAction(): Promise<ActionState> {
    return runSecureAction(
        { rateLimitKey: "auth" },
        async (_data, userId) => {
            const cookieStore = await cookies()
            const currentToken = cookieStore.get("better-auth.session_token")?.value?.split(".")[0] ?? ""

            const result = await prisma.session.deleteMany({
                where: {
                    userId,
                    token: { not: currentToken },
                },
            })

            logger.info("All other sessions revoked", { userId, count: result.count })
            revalidatePath("/dashboard/settings")
        },
    )
}
