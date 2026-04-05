"use server"

import { prisma } from "@/lib/prisma"
import { runSecureAction, type ActionState } from "@/lib/safe-action"
import { revalidatePath } from "next/cache"
import { createLogger } from "@/lib/logger"

const logger = createLogger("SessionActions")

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
export async function revokeAllOtherSessionsAction(currentSessionToken: string): Promise<ActionState> {
    return runSecureAction(
        { rateLimitKey: "auth" },
        async (_data, userId) => {
            const result = await prisma.session.deleteMany({
                where: {
                    userId,
                    token: { not: currentSessionToken },
                },
            })

            logger.info("All other sessions revoked", { userId, count: result.count })
            revalidatePath("/dashboard/settings")
        },
    )
}
