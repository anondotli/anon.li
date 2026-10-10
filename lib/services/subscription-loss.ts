import type Stripe from "stripe"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/logger"
import { DAY_MS, SUBSCRIPTION_GRACE_PERIOD_DAYS } from "@/lib/constants"
import { claimSubscriptionLossNotification } from "@/lib/services/subscription-sync"

const logger = createLogger("SubscriptionLoss")

/**
 * Stripe states a subscription does not recover from on its own: dunning gave
 * up (`unpaid`), a trial ended without a payment method (`paused`), or it
 * ended. `past_due`/`incomplete` are still being retried: access is suspended
 * by the status sync alone, but files and resources are not put on a deletion
 * clock yet.
 */
export const LOST_STRIPE_STATUSES: ReadonlySet<Stripe.Subscription.Status> = new Set([
    "canceled",
    "incomplete_expired",
    "unpaid",
    "paused",
])

export type SubscriptionOwnerContext = {
    organizationId: string | null
    user: { id: string; email: string } | null
}

/**
 * Whether the user still holds another active/trialing PERSONAL subscription
 * (any provider). The subscription being lost has already been synced to a
 * non-entitling status (or never had a canonical row), so it cannot count
 * itself here.
 */
async function hasOtherActivePersonalSubscription(userId: string): Promise<boolean> {
    const count = await prisma.subscription.count({
        where: {
            userId,
            organizationId: null,
            status: { in: ["active", "trialing"] },
        },
    })
    return count > 0
}

/**
 * Apply the side effects of a terminally lost subscription. Shared by the
 * Stripe webhook (payment failed, updated, deleted) and the missed-webhook
 * reconciliation paths, which can all observe the same loss; only the first
 * signal per subscription notifies and (re)starts the downgrade clock
 * (`claimSubscriptionLossNotification`), while the idempotent drop-grace
 * writes always run.
 *
 * `notify` overrides the claim for a deleted subscription with no canonical
 * row, which has no row to record the claim on.
 */
export async function handleLostSubscription(
    subscriptionId: string,
    context: SubscriptionOwnerContext,
    opts: { notify?: boolean } = {},
): Promise<void> {
    // Org subscription: downgrade the ORG (grace on org drops, notify all org
    // admins), not the billing user's personal account.
    if (context.organizationId) {
        const notify = opts.notify ?? await claimSubscriptionLossNotification(subscriptionId)
        const expiryDate = new Date(Date.now() + SUBSCRIPTION_GRACE_PERIOD_DAYS * DAY_MS)
        const { handleOrgSubscriptionLoss } = await import("@/lib/services/org-billing")
        await handleOrgSubscriptionLoss(context.organizationId, expiryDate, { notify })
        return
    }

    if (!context.user) return

    // Losing one subscription must not downgrade a user who retains another
    // active personal subscription (e.g. mid-migration between plans): the
    // drop expiry stamped on loss is enforced by drop cleanup regardless of
    // current entitlements, so it would eventually delete files the user is
    // still entitled to keep.
    if (await hasOtherActivePersonalSubscription(context.user.id)) {
        logger.info("Skipping personal downgrade side effects; user retains another active subscription", {
            userId: context.user.id,
            subscriptionId,
        })
        return
    }

    const notify = opts.notify ?? await claimSubscriptionLossNotification(subscriptionId)
    const { BillingDowngradeService } = await import("@/lib/services/billing-downgrade")
    await BillingDowngradeService.handlePersonalSubscriptionLoss(context.user.id, context.user.email, { notify })
}

/**
 * A subscription became entitling again: undo the loss side effects. Personal
 * recovery cancels the downgrade (unschedules resources, restores grace-stamped
 * drops); org recovery restores grace-stamped org drops.
 */
export async function handleRecoveredSubscription(context: {
    organizationId: string | null
    userId: string | null
}): Promise<void> {
    if (context.organizationId) {
        const { restoreOrgDropGrace } = await import("@/lib/services/org-billing")
        await restoreOrgDropGrace(context.organizationId)
        return
    }
    if (!context.userId) return
    const { BillingDowngradeService } = await import("@/lib/services/billing-downgrade")
    await BillingDowngradeService.cancelDowngrade(context.userId)
}
