import "server-only"

import { APIError } from "@better-auth/core/error"
import { getOrgSeatUsage } from "@/lib/org-seats"
import { revokeOrganizationMemberAccess } from "@/lib/auth-hooks"
import { createLogger } from "@/lib/logger"

/**
 * Organization lifecycle steps wired into better-auth's `organizationHooks`
 * (lib/auth.ts). Kept here so each step is unit-testable without building the
 * whole auth instance.
 */

const logger = createLogger("OrgLifecycle")

/**
 * `beforeCreateInvitation`: an invitation reserves a seat. Reject when current
 * members plus pending, unexpired invitations already fill the paid seats, so
 * an owner can't hand out invitations that can never all be accepted.
 * (Resends of a still-pending invitation don't reach this hook — better-auth
 * answers them before creating anything — so they never double-count.)
 */
export async function assertInvitationSeatAvailable(organizationId: string): Promise<void> {
    const usage = await getOrgSeatUsage(organizationId)
    if (usage.members + usage.pendingInvitations >= usage.limit) {
        throw APIError.from("FORBIDDEN", {
            message: usage.pendingInvitations > 0
                ? `All ${usage.limit} seats are in use or reserved by pending invitations. Cancel an invitation or add seats before inviting more people.`
                : `All ${usage.limit} seats are in use. Add seats before inviting more people.`,
            code: "ORG_SEAT_LIMIT_REACHED",
        })
    }
}

/**
 * `beforeDeleteOrganization`: stop the team's Stripe billing first — its
 * Subscription rows cascade with the org, which would otherwise leave Stripe
 * charging a deleted team with nothing left to cancel it from. Fails the delete
 * when a cancellation can't be confirmed (same policy as the admin org delete),
 * then erases org-owned Drop blobs best-effort before the cascade removes the
 * rows that point at them.
 */
export async function prepareOrganizationDeletion(organizationId: string): Promise<void> {
    try {
        const { DeletionService } = await import("@/lib/services/deletion")
        await DeletionService.cancelOrganizationStripeSubscriptions(organizationId)
    } catch (error) {
        logger.error("Blocked team deletion: Stripe cancellation not confirmed", error, { organizationId })
        throw APIError.from("SERVICE_UNAVAILABLE", {
            message: error instanceof Error && error.message
                ? error.message
                : "Couldn't cancel the team's subscription, so the team was not deleted. Try again.",
            code: "ORG_BILLING_CANCEL_FAILED",
        })
    }

    // Best-effort: failed keys are tracked as orphaned files for cron retry —
    // storage never blocks org deletion.
    try {
        const { eraseOrgDrops } = await import("@/lib/services/erasure")
        await eraseOrgDrops(organizationId)
    } catch (error) {
        logger.error("Failed to erase org drops before deletion", error, { organizationId })
    }
}

/**
 * `afterRemoveMember`: revoke the removed member's org vault-key grant and org
 * API keys, and flag a key rotation. Awaited (not fire-and-forget) so the
 * revocation completes within the request instead of racing the response — an
 * unawaited promise can be cut off when a serverless invocation ends. Errors
 * are logged, never thrown: the removal itself has already been committed.
 */
export async function revokeRemovedMemberAccess(organizationId: string, userId: string): Promise<void> {
    try {
        await revokeOrganizationMemberAccess(organizationId, userId)
    } catch (error) {
        logger.error("Failed to revoke org access after member removal", error, { organizationId, userId })
    }
}
