/**
 * Deletion Lifecycle Service
 *
 * Manages account deletion through a state machine:
 *   pending → backup_retention → completed
 *
 * Each transition is idempotent and can be retried safely.
 */

import { prisma } from "@/lib/prisma"
import { eraseUserDrops } from "@/lib/services/erasure"
import { createLogger } from "@/lib/logger"
import { getVaultSchemaState } from "@/lib/vault/schema"

const logger = createLogger("DeletionService")

/** Days to retain data after active-system deletion */
const BACKUP_RETENTION_DAYS = 30

export class DeletionService {
    /**
     * Request account deletion. Creates a DeletionRequest in "pending" state,
     * immediately revokes all sessions, and blocks new sign-ins.
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
            const vaultSchema = await getVaultSchemaState()

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

            const authCleanupOperations = [
                prisma.account.deleteMany({ where: { userId } }),
                prisma.twoFactor.deleteMany({ where: { userId } }),
            ]

            if (vaultSchema.dropOwnerKeys) {
                authCleanupOperations.push(prisma.dropOwnerKey.deleteMany({ where: { userId } }))
            }

            if (vaultSchema.userSecurity) {
                authCleanupOperations.push(prisma.userSecurity.deleteMany({ where: { userId } }))
            }

            await prisma.$transaction(authCleanupOperations)

            // Delete other resources
            await prisma.apiKey.deleteMany({ where: { userId } })
            await prisma.recipient.deleteMany({ where: { userId } })
            await prisma.subscription.deleteMany({ where: { userId } })

            // Active systems are now wiped; retain the user row only until the
            // backup retention window elapses so the final hard delete can run.
            await prisma.deletionRequest.update({
                where: { id: requestId },
                data: { status: "backup_retention" },
            })

            logger.info("Deletion entered backup retention", { userId, requestId })
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
                status: {
                    in: ["active_systems_deleted", "backup_retention"],
                },
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
