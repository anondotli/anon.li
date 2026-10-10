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
import { purgePersonalVaultKeysOps } from "@/lib/vault/personal-purge"
import { createLogger } from "@/lib/logger"
import type { Prisma } from "@prisma/client"
import { ServiceUnavailableError, ValidationError } from "@/lib/api-error-utils"

const logger = createLogger("DeletionService")

/** Subscription states in which Stripe may still bill the customer. */
const BILLABLE_SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due", "unpaid", "incomplete"]

function isStripeResourceMissing(error: unknown): boolean {
    return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "resource_missing"
}

/**
 * Immediately cancel every billable Stripe subscription matching `scope`, and
 * record each cancellation locally so a retry doesn't call Stripe again.
 * Throws ServiceUnavailableError(`failureMessage`) when a cancellation can't be
 * confirmed, so the caller stops before deleting anything.
 */
async function cancelStripeSubscriptions(
    scope: Prisma.SubscriptionWhereInput,
    logContext: Record<string, unknown>,
    failureMessage: string,
): Promise<void> {
    const subscriptions = await prisma.subscription.findMany({
        where: {
            ...scope,
            provider: "stripe",
            providerSubscriptionId: { not: null },
            status: { in: BILLABLE_SUBSCRIPTION_STATUSES },
        },
        select: { id: true, providerSubscriptionId: true },
    })
    if (subscriptions.length === 0) return

    // Loaded lazily: lib/stripe throws at import time without billing env.
    const { stripe } = await import("@/lib/stripe")

    for (const subscription of subscriptions) {
        const providerSubscriptionId = subscription.providerSubscriptionId!
        try {
            await stripe.subscriptions.cancel(providerSubscriptionId)
        } catch (error) {
            // Already gone or already canceled on Stripe's side is fine.
            const current = isStripeResourceMissing(error)
                ? null
                : await stripe.subscriptions.retrieve(providerSubscriptionId).catch(() => null)
            const alreadyEnded = isStripeResourceMissing(error)
                || current?.status === "canceled"
                || current?.status === "incomplete_expired"
            if (!alreadyEnded) {
                logger.error("Failed to cancel Stripe subscription before deletion", error, {
                    ...logContext,
                    subscriptionId: subscription.id,
                })
                throw new ServiceUnavailableError(failureMessage)
            }
        }

        await prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: "canceled", cancelAtPeriodEnd: false },
        })
        logger.info("Canceled Stripe subscription before deletion", {
            ...logContext,
            subscriptionId: subscription.id,
        })
    }
}

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
     * Cancel the user's PERSONAL Stripe subscriptions immediately. Deleting the
     * local Subscription rows alone would leave Stripe billing a customer whose
     * account no longer exists. Org subscriptions belong to the org and are left
     * alone (the sole-owner guard already prevents orphaning an org).
     *
     * Throws if any cancellation can't be confirmed, so deletion stops before
     * erasing data and the request stays as a retry marker.
     */
    static async cancelPersonalStripeSubscriptions(userId: string): Promise<void> {
        await cancelStripeSubscriptions(
            { userId, organizationId: null },
            { userId },
            "We couldn't cancel your active subscription, so your account was not deleted. Please try again or contact support.",
        )
    }

    /**
     * Cancel an ORGANIZATION's Stripe subscriptions immediately, before the org
     * row (and with it the local Subscription rows, onDelete: Cascade) is
     * deleted — otherwise Stripe keeps billing for a team that no longer exists.
     * Throws if any cancellation can't be confirmed, so the org is not deleted.
     */
    static async cancelOrganizationStripeSubscriptions(organizationId: string): Promise<void> {
        await cancelStripeSubscriptions(
            { organizationId },
            { organizationId },
            "Couldn't cancel the organization's active Stripe subscription, so the organization was not deleted. Cancel it in Stripe or try again.",
        )
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
            throw new ValidationError(
                `Cannot delete account: sole owner of ${soleOwnerOrgs.map((o) => o.name).join(", ")}. Transfer ownership or delete the team first.`,
            )
        }

        // Stop billing before anything is revoked: if Stripe is unreachable the
        // user stays signed in and can simply retry.
        await this.cancelPersonalStripeSubscriptions(userId)

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

        // No terminal-status short-circuit: a fully-processed request rests at
        // "active_systems_deleted" (completeDeletion removes the row outright, so
        // no row ever reaches a "completed" state). Re-processing that request is
        // exactly what the admin retry does, and is safe — every step is guarded
        // by its own flag and the unflagged tail is all idempotent deleteMany.

        const userId = request.userId

        try {
            // All resource deletions below are scoped to PERSONAL rows
            // (organizationId: null). Org-owned resources the user created belong
            // to the org, not the user — their FK userId is SetNull on user
            // deletion so they persist under the organization.

            // Step 0: Stop billing (idempotent — re-checked here so admin retries
            // and requests created elsewhere are covered too).
            await this.cancelPersonalStripeSubscriptions(userId)

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
                // Personal owner keys + userSecurity only. An org owner key is the
                // sole copy of the key sealed to the org vault key (shared with the
                // team) and must survive — purgePersonalVaultKeysOps enforces the
                // organizationId: null scoping (shared with the password-reset hook).
                ...purgePersonalVaultKeysOps(userId),
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
}
