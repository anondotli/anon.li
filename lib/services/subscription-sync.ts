import Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/logger"
import { getPlanFromPriceId } from "@/config/plans"
import type { Prisma } from "@prisma/client"
import { audit } from "@/lib/services/audit"
import { DAY_MS } from "@/lib/constants"

const logger = createLogger("SubscriptionSync")

/**
 * Map Stripe subscription status to our Subscription table status.
 * Exported for unit testing — billing access hinges on this mapping being right.
 */
export function mapStripeStatus(stripeStatus: Stripe.Subscription.Status): string {
    switch (stripeStatus) {
        case "active":
            return "active"
        case "trialing":
            return "trialing"
        case "canceled":
        case "incomplete_expired":
            return "canceled"
        case "past_due":
        case "unpaid":
        case "incomplete":
        case "paused":
            return "past_due"
        default:
            return "canceled"
    }
}

/**
 * Upsert a Stripe subscription into the canonical Subscription table.
 * Keyed on providerSubscriptionId (unique constraint).
 * Returns true if the upsert succeeded, false if skipped (unknown price).
 */
export async function upsertStripeSubscription(
    userId: string,
    subscription: Stripe.Subscription,
): Promise<boolean> {
    const priceId = subscription.items.data[0]?.price.id
    if (!priceId) {
        logger.warn("Stripe subscription has no price item, skipping upsert", { subscriptionId: subscription.id })
        return false
    }

    const plan = getPlanFromPriceId(priceId)
    if (!plan) {
        logger.warn("Unknown Stripe price ID, skipping Subscription upsert", { priceId, subscriptionId: subscription.id })
        return false
    }

    const customerId = typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id

    const item = subscription.items.data[0]
    const periodStart = item?.current_period_start
        ? new Date(item.current_period_start * 1000)
        : null
    const periodEnd = item?.current_period_end
        ? new Date(item.current_period_end * 1000)
        : (subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null)

    // Resolve the owning org and seat count, preferring the canonical local row
    // over transient Stripe metadata (metadata can be missing on renewals or
    // out-of-band subs — trusting it alone would mis-handle org cancellations and
    // could shrink a multi-seat org to 1 seat).
    const existing = await prisma.subscription.findUnique({
        where: { providerSubscriptionId: subscription.id },
        select: { seats: true, organizationId: true },
    })
    const organizationId = subscription.metadata?.organizationId || existing?.organizationId || null
    // Default to the PRIOR seat count (never silently shrink to 1) when Stripe
    // omits the item quantity on a webhook payload.
    const seats = item?.quantity ?? existing?.seats ?? 1
    // For org subs, the prior seat count lets us audit real seat changes.
    const priorSeats = organizationId ? existing?.seats ?? null : null

    await prisma.subscription.upsert({
        where: { providerSubscriptionId: subscription.id },
        create: {
            userId,
            organizationId,
            provider: "stripe",
            providerSubscriptionId: subscription.id,
            providerCustomerId: customerId,
            providerPriceId: priceId,
            product: plan.product,
            tier: plan.tier,
            seats,
            status: mapStripeStatus(subscription.status),
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
        },
        update: {
            // Never un-link an org on update; always propagate seat changes.
            ...(organizationId ? { organizationId } : {}),
            providerCustomerId: customerId,
            providerPriceId: priceId,
            product: plan.product,
            tier: plan.tier,
            seats,
            status: mapStripeStatus(subscription.status),
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
        },
    })

    // Audit real seat changes on an org subscription (fire-and-forget).
    if (organizationId && priorSeats !== null && priorSeats !== seats) {
        void audit({
            action: "org.billing.seats_change",
            actorId: userId,
            targetId: subscription.id,
            organizationId,
            metadata: { from: priorSeats, to: seats },
        })
    }

    return true
}

/**
 * Sync subscription state from Stripe to database.
 * Use this when webhooks may have been missed or for on-demand verification.
 */
export async function syncSubscriptionFromStripe(userId: string): Promise<{
    synced: boolean
    error?: string
}> {
    const SYNC_LIMIT = 50
    const subscriptions = await prisma.subscription.findMany({
        where: { userId, provider: "stripe", providerSubscriptionId: { not: null } },
        select: { providerSubscriptionId: true },
        orderBy: { createdAt: "desc" },
        take: SYNC_LIMIT,
    })

    if (subscriptions.length === 0) {
        return { synced: true }
    }

    if (subscriptions.length === SYNC_LIMIT) {
        logger.warn("syncSubscriptionFromStripe hit row cap — older subscriptions skipped", {
            userId,
            limit: SYNC_LIMIT,
        })
    }

    let synced = 0
    let lastError: string | undefined

    for (const sub of subscriptions) {
        if (!sub.providerSubscriptionId) continue

        try {
            const subscription = await stripe.subscriptions.retrieve(sub.providerSubscriptionId)
            await upsertStripeSubscription(userId, subscription)
            synced++
        } catch (error) {
            logger.error("Failed to sync subscription from Stripe", error, { subscriptionId: sub.providerSubscriptionId })

            // If subscription doesn't exist in Stripe, mark canonical row as canceled.
            if (error instanceof Stripe.errors.StripeInvalidRequestError && error.code === "resource_missing") {
                await prisma.subscription.updateMany({
                    where: { providerSubscriptionId: sub.providerSubscriptionId },
                    data: { status: "canceled", cancelAtPeriodEnd: false },
                })
                synced++
                continue
            }

            lastError = error instanceof Error ? error.message : "Unknown error"
        }
    }

    if (synced === 0 && lastError) {
        return { synced: false, error: lastError }
    }

    return { synced: true }
}

/**
 * Reconcile DB rows that are stored as active/trialing but whose billing period
 * has lapsed past the access grace window — the signature of a missed Stripe
 * webhook (a payment_failed / subscription.deleted that never reached us, leaving
 * the row permanently "active"). Re-fetches each from Stripe and writes back the
 * true status so stale rows can't inflate admin MRR or linger past their real end.
 *
 * This is a safety net for the webhook handler, not a replacement: it owns only
 * "is this still active, and until when". A targeted status/period update (rather
 * than a full upsertStripeSubscription) needs no userId, so it also covers org
 * subs whose buyer account was deleted (userId = null); plan/seat changes remain
 * the job of the customer.subscription.updated webhook.
 */
export async function reconcileStaleStripeSubscriptions(limit = 100): Promise<{
    checked: number
    revoked: number
    refreshed: number
    errors: number
}> {
    // Mirror the entitlement guards (currentPeriodEnd + 1 day): only touch rows
    // genuinely past their paid period, so a sub that renewed moments ago (webhook
    // still in flight) isn't needlessly re-fetched and flapped.
    const cutoff = new Date(Date.now() - DAY_MS)

    const stale = await prisma.subscription.findMany({
        where: {
            provider: "stripe",
            providerSubscriptionId: { not: null },
            status: { in: ["active", "trialing"] },
            currentPeriodEnd: { lt: cutoff },
        },
        select: { providerSubscriptionId: true },
        orderBy: { currentPeriodEnd: "asc" },
        take: limit,
    })

    let checked = 0
    let revoked = 0
    let refreshed = 0
    let errors = 0

    for (const row of stale) {
        const subId = row.providerSubscriptionId
        if (!subId) continue
        checked++

        try {
            const subscription = await stripe.subscriptions.retrieve(subId)
            const item = subscription.items.data[0]
            const periodEnd = item?.current_period_end
                ? new Date(item.current_period_end * 1000)
                : (subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null)
            const status = mapStripeStatus(subscription.status)

            await prisma.subscription.updateMany({
                where: { providerSubscriptionId: subId },
                data: {
                    status,
                    currentPeriodEnd: periodEnd,
                    cancelAtPeriodEnd: subscription.cancel_at_period_end,
                },
            })

            if (status === "active" || status === "trialing") {
                refreshed++
            } else {
                revoked++
            }
        } catch (error) {
            // Subscription no longer exists in Stripe → it's gone for good; cancel.
            if (error instanceof Stripe.errors.StripeInvalidRequestError && error.code === "resource_missing") {
                await prisma.subscription.updateMany({
                    where: { providerSubscriptionId: subId },
                    data: { status: "canceled", cancelAtPeriodEnd: false },
                })
                revoked++
                continue
            }
            // Transient (network/Stripe 5xx): leave the row for the next run.
            logger.error("Failed to reconcile subscription from Stripe", error, { subscriptionId: subId })
            errors++
        }
    }

    if (checked > 0) {
        logger.info("Reconciled stale Stripe subscriptions", { checked, revoked, refreshed, errors })
    }

    return { checked, revoked, refreshed, errors }
}

/**
 * Create or update a crypto subscription in the canonical Subscription table.
 * Uses a synthetic providerSubscriptionId (crypto_{orderId}) for idempotent upserts.
 * Deactivates any other active subscriptions for the user first.
 *
 * Must be invoked from inside a Serializable transaction so that the
 * read-then-write logic (expire-others / upsert-this) is conflict-checked by
 * Postgres — otherwise concurrent IPNs for the same user can both observe no
 * existing actives and end up creating two simultaneously-active rows.
 */
export async function createCryptoSubscription(
    tx: Prisma.TransactionClient,
    userId: string,
    product: string,
    tier: string,
    periodStart: Date,
    periodEnd: Date,
    orderId: string,
): Promise<void> {
    const syntheticSubId = `crypto_${orderId}`

    // Expire other active PERSONAL subscriptions (not this one). Scoped to
    // organizationId: null so a user buying a personal crypto plan can't expire
    // their org's Business subscription (which carries their userId as the buyer).
    await tx.subscription.updateMany({
        where: {
            userId,
            organizationId: null,
            status: "active",
            providerSubscriptionId: { not: syntheticSubId },
        },
        data: { status: "expired" },
    })

    // Upsert this subscription idempotently
    await tx.subscription.upsert({
        where: { providerSubscriptionId: syntheticSubId },
        create: {
            userId,
            provider: "crypto",
            providerSubscriptionId: syntheticSubId,
            product,
            tier,
            status: "active",
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
        },
        update: {
            product,
            tier,
            status: "active",
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
        },
    })
}
