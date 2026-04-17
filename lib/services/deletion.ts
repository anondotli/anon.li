/**
 * Deletion Service
 *
 * Account deletion is immediate: the request row blocks access while active
 * resources are erased, then the request row and user row are hard-deleted.
 *
 * Each transition is idempotent and can be retried safely.
 */

import { prisma } from "@/lib/prisma"
import { eraseUserDrops } from "@/lib/services/erasure"
import { createLogger } from "@/lib/logger"
import { getVaultSchemaState } from "@/lib/vault/schema"

const logger = createLogger("DeletionService")

export class DeletionService {
    /**
     * Request account deletion. Creates a DeletionRequest in "pending" state to
     * block new access, erases active resources, then hard-deletes the user.
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
                sessionsDeleted: true,
            },
            update: {
                status: "pending",
                sessionsDeleted: true,
                completedAt: null,
            },
        })

        logger.info("Deletion requested", { userId, requestId: request.id })

        // Process and complete immediately. If either step fails, the request
        // row remains as an access-blocking retry marker for admins.
        await this.processDeletion(request.id)
        await this.completeDeletion(request.id)

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

            // Active systems are now wiped; the caller can immediately hard-delete
            // the user row once this marker is written.
            await prisma.deletionRequest.update({
                where: { id: requestId },
                data: { status: "active_systems_deleted", completedAt: new Date() },
            })

            logger.info("Active-system deletion completed", { userId, requestId })
        } catch (error) {
            logger.error("Deletion processing failed", error, { userId, requestId })
            throw error
        }
    }

    /**
     * Complete deletion immediately after active-system erasure. The request row
     * must be removed first because it references the user row.
     */
    static async completeDeletion(requestId: string): Promise<void> {
        const request = await prisma.deletionRequest.findUnique({
            where: { id: requestId },
        })

        if (!request) return

        const userId = request.userId

        await prisma.$transaction([
            prisma.deletionRequest.delete({ where: { id: requestId } }),
            prisma.user.delete({ where: { id: userId } }),
        ])

        logger.info("Deletion completed", { userId, requestId })
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
