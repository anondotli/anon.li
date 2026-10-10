"use server"

import { prisma } from "@/lib/prisma"
import { runSecureAction, type ActionState } from "@/lib/safe-action"
import { revalidatePath } from "next/cache"
import { createLogger } from "@/lib/logger"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getTurnstileError } from "@/lib/turnstile"
import { normalizeEmail } from "@/lib/vault/server"

const logger = createLogger("SessionActions")
const PASSWORD_RESET_SUCCESS_MESSAGE = "If this email exists in our system, check your email for the reset link."

export async function requestPasswordResetAction(
    email: string,
    turnstileToken?: string,
): Promise<ActionState<{ message: string }>> {
    const normalizedEmail = normalizeEmail(email)

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
        return { error: "Enter a valid email address" }
    }

    try {
        const turnstileError = await getTurnstileError(turnstileToken)
        if (turnstileError) {
            return { error: turnstileError }
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
            // Resolve the current session through better-auth rather than reading
            // the cookie by name: in production the cookie is
            // `__Secure-better-auth.session_token`, and a missed lookup would
            // exclude nothing and sign out THIS device too.
            const current = await auth.api.getSession({ headers: await headers() })
            if (!current?.session?.id || current.user.id !== userId) {
                throw new Error("Could not resolve the current session")
            }

            const result = await prisma.session.deleteMany({
                where: {
                    userId,
                    id: { not: current.session.id },
                },
            })

            logger.info("All other sessions revoked", { userId, count: result.count })
            revalidatePath("/dashboard/settings")
        },
    )
}
