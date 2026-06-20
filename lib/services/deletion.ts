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

const logger = createLogger("DeletionService")

export class DeletionService {
    /**
     * Organizations where this user is the SOLE owner. Deleting such a user would
     * orphan the org (and its shared resources/billing) with no one able to manage
     * it — so account deletion must be blocked until ownership is transferred or
     * the team is deleted. better-auth already blocks the equivalent member-side
     * paths (leave / remove / demote the last owner); this covers OUR account-
     * deletion flow, which better-auth doesn't see.
     */
    static async findSoleOwnerOrganizations(userId: string): Promise<{ id: string; name: string }[]> {
        const memberships = await prisma.member.findMany({
            where: { userId },
            select: { organizationId: true, role: true },
        })
        const ownerOrgIds = memberships
            .filter((m) => m.role.split(",").includes("owner"))
            .map((m) => m.organizationId)
        if (ownerOrgIds.length === 0) return []

        const orgs = await prisma.organization.findMany({
            where: { id: { in: ownerOrgIds } },
            select: { id: true, name: true, members: { select: { role: true } } },
        })
        return orgs
            .filter((org) => org.members.filter((m) => m.role.split(",").includes("owner")).length <= 1)
            .map((org) => ({ id: org.id, name: org.name }))
    }

    /**
     * Request account deletion. Creates a DeletionRequest in "pending" state to
     * block new access, erases active resources, then hard-deletes the user.
     */
    static async requestDeletion(userId: string): Promise<string> {
        // Guard: never orphan an org by deleting its sole owner (defense-in-depth
        // for all callers, incl. admin force-delete; the user-facing action
        // pre-checks this to surface a friendlier message).
        const soleOwnerOrgs = await this.findSoleOwnerOrganizations(userId)
        if (soleOwnerOrgs.length > 0) {
            throw new Error(
                `Cannot delete account: sole owner of ${soleOwnerOrgs.map((o) => o.name).join(", ")}. Transfer ownership or delete the team first.`,
            )
        }

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
            // All resource deletions below are scoped to PERSONAL rows
            // (organizationId: null). Org-owned resources the user created belong
            // to the org, not the user — their FK userId is SetNull on user
            // deletion so they persist under the organization.

            // Step 1: Delete aliases
            if (!request.aliasesDeleted) {
                await prisma.alias.deleteMany({ where: { userId, organizationId: null } })
                await prisma.deletionRequest.update({
                    where: { id: requestId },
                    data: { aliasesDeleted: true },
                })
            }

            // Step 2: Delete domains
            if (!request.domainsDeleted) {
                await prisma.domain.deleteMany({ where: { userId, organizationId: null } })
                await prisma.deletionRequest.update({
                    where: { id: requestId },
                    data: { domainsDeleted: true },
                })
            }

            // Step 3: Delete forms (cascades to FormSubmission + FormOwnerKey;
            // FormSubmission.attachedDropId is SetNull, so attached drops
            // remain owned by the user and get cleaned up by the storage and
            // drop steps below.)
            if (!request.formsDeleted) {
                await prisma.form.deleteMany({ where: { userId, organizationId: null } })
                await prisma.deletionRequest.update({
                    where: { id: requestId },
                    data: { formsDeleted: true },
                })
            }

            // Step 4: Delete storage files (S3)
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

            // Step 5: Delete drops (DB records)
            if (!request.dropsDeleted) {
                await prisma.drop.deleteMany({ where: { userId, organizationId: null } })
                await prisma.deletionRequest.update({
                    where: { id: requestId },
                    data: { dropsDeleted: true },
                })
            }

            // Step 6: Delete sessions (if not already done)
            if (!request.sessionsDeleted) {
                await prisma.session.deleteMany({ where: { userId } })
                await prisma.deletionRequest.update({
                    where: { id: requestId },
                    data: { sessionsDeleted: true },
                })
            }

            await prisma.$transaction([
                prisma.account.deleteMany({ where: { userId } }),
                prisma.twoFactor.deleteMany({ where: { userId } }),
                // Personal owner keys only: an org owner key is the sole copy of
                // the key sealed to the org vault key (shared with the team) and
                // must survive — its userId is SetNull on user deletion.
                prisma.dropOwnerKey.deleteMany({ where: { userId, organizationId: null } }),
                prisma.userSecurity.deleteMany({ where: { userId } }),
            ])

            // Delete other resources (personal only — org-owned rows belong to
            // the org and are retained via FK SetNull).
            await prisma.apiKey.deleteMany({ where: { userId } })
            await prisma.recipient.deleteMany({ where: { userId, organizationId: null } })
            await prisma.subscription.deleteMany({ where: { userId, organizationId: null } })

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
            // Bound the scan; any remainder is retried on the next run.
            take: 500,
        })

        return requests.map((r) => r.id)
    }
}
