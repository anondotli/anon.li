/**
 * Deletion Lifecycle Service
 *
 * Manages account deletion through a state machine:
 *   pending → active_systems_deleted → backup_retention → completed
 *
 * Each transition is idempotent and can be retried safely.
 */

import { prisma } from "@/lib/prisma"
import { eraseUserDrops } from "@/lib/services/erasure"
import { createLogger } from "@/lib/logger"

const logger = createLogger("DeletionService")

/** Days to retain data after active systems are deleted */
const BACKUP_RETENTION_DAYS = 30

export class DeletionService {
    /**
     * Request account deletion. Creates a DeletionRequest in "pending" state
     * and immediately revokes all sessions.
     */
    static async requestDeletion(userId: string): Promise<string> {
        // Revoke all sessions immediately
        await prisma.session.deleteMany({ where: { userId } })

        // Create or update deletion request
        const request = await prisma.deletionRequest.upsert({
            where: { userId },
            create: {
                userId,
                status: "pending",
            },
            update: {
                status: "pending",
                sessionsDeleted: true,
                completedAt: null,
            },
        })

        await prisma.deletionRequest.update({
            where: { id: request.id },
            data: { sessionsDeleted: true },
        })

        logger.info("Deletion requested", { userId, requestId: request.id })

        // Process immediately (can also be called by a cron job for retries)
        await this.processDeletion(request.id)

        return request.id
    }

    /**
     * Process a deletion request through its state machine.
     * Idempotent — safe to call multiple times.
     */
    static async processDeletion(requestId: string): Promise<void> {
        const request = await prisma.deletionRequest.findUnique({
            where: { id: requestId },
        })

        if (!request) {
            logger.error("Deletion request not found", undefined, { requestId })
            return
        }

        if (request.status === "completed") return

        const userId = request.userId

        try {
            // Step 1: Delete aliases
            if (!request.aliasesDeleted) {
                await prisma.alias.deleteMany({ where: { userId } })
                await prisma.deletionRequest.update({
                    where: { id: requestId },
                    data: { aliasesDeleted: true },
                })
            }

            // Step 2: Delete domains
            if (!request.domainsDeleted) {
                await prisma.domain.deleteMany({ where: { userId } })
                await prisma.deletionRequest.update({
                    where: { id: requestId },
                    data: { domainsDeleted: true },
                })
            }

            // Step 3: Delete storage files (S3)
            if (!request.storageDeleted) {
                const result = await eraseUserDrops(userId)

                await prisma.deletionRequest.update({
                    where: { id: requestId },
                    data: {
                        storageDeleted: true,
                        failedStorageKeys: result.failedKeys > 0
                            ? JSON.stringify({ count: result.failedKeys })
                            : null,
                    },
                })
            }

            // Step 4: Delete drops (DB records)
            if (!request.dropsDeleted) {
                await prisma.drop.deleteMany({ where: { userId } })
                await prisma.deletionRequest.update({
                    where: { id: requestId },
                    data: { dropsDeleted: true },
                })
            }

            // Step 5: Delete sessions (if not already done)
            if (!request.sessionsDeleted) {
                await prisma.session.deleteMany({ where: { userId } })
                await prisma.deletionRequest.update({
                    where: { id: requestId },
                    data: { sessionsDeleted: true },
                })
            }

            // Delete other resources
            await prisma.apiKey.deleteMany({ where: { userId } })
            await prisma.recipient.deleteMany({ where: { userId } })
            await prisma.subscription.deleteMany({ where: { userId } })

            // Mark as active_systems_deleted
            await prisma.deletionRequest.update({
                where: { id: requestId },
                data: { status: "active_systems_deleted" },
            })

            logger.info("Active systems deleted", { userId, requestId })
        } catch (error) {
            logger.error("Deletion processing failed", error, { userId, requestId })
            throw error
        }
    }

    /**
     * Complete deletion after backup retention period.
     * Called by a cron job. Hard-deletes the User row.
     */
    static async completeDeletion(requestId: string): Promise<void> {
        const request = await prisma.deletionRequest.findUnique({
            where: { id: requestId },
        })

        if (!request || request.status === "completed") return

        const userId = request.userId

        // Delete request first (FK to User would block user deletion)
        await prisma.deletionRequest.delete({ where: { id: requestId } })

        // Hard-delete the user (cascades remaining records)
        await prisma.user.delete({ where: { id: userId } })

        logger.info("Deletion completed", { userId, requestId })
    }

    /**
     * Find all deletion requests ready for completion (past retention period).
     * Used by the cron job.
     */
    static async findCompletable(): Promise<string[]> {
        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() - BACKUP_RETENTION_DAYS)

        const requests = await prisma.deletionRequest.findMany({
            where: {
                status: "active_systems_deleted",
                requestedAt: { lt: cutoff },
            },
            select: { id: true },
        })

        return requests.map((r) => r.id)
    }

    /**
     * Find pending deletion requests that need processing (retries).
     */
    static async findPending(): Promise<string[]> {
        const requests = await prisma.deletionRequest.findMany({
            where: { status: "pending" },
            select: { id: true },
        })

        return requests.map((r) => r.id)
    }
}
