import Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/logger"
import { getPlanFromPriceId } from "@/config/plans"
import type { Prisma } from "@prisma/client"

const logger = createLogger("SubscriptionSync")

/**
 * Map Stripe subscription status to our Subscription table status.
 */
function mapStripeStatus(stripeStatus: Stripe.Subscription.Status): string {
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

    await prisma.subscription.upsert({
        where: { providerSubscriptionId: subscription.id },
        create: {
            userId,
            provider: "stripe",
            providerSubscriptionId: subscription.id,
            providerCustomerId: customerId,
            providerPriceId: priceId,
            product: plan.product,
            tier: plan.tier,
            status: mapStripeStatus(subscription.status),
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
        },
        update: {
            providerCustomerId: customerId,
            providerPriceId: priceId,
            product: plan.product,
            tier: plan.tier,
            status: mapStripeStatus(subscription.status),
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
        },
    })

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

    // Expire other active subscriptions (not this one)
    await tx.subscription.updateMany({
        where: {
            userId,
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
