import "server-only"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/logger"
import { captureServerEvent, flushPostHog } from "@/lib/posthog.server"
import {
    ALIAS_PLANS,
    BUNDLE_PLANS,
    BUSINESS_PLAN,
    BUSINESS_SEAT_PRICE,
    DROP_PLANS,
    FORM_PLANS,
} from "@/config/plans"

const logger = createLogger("CronBusinessSnapshot")

const DAY_MS = 24 * 60 * 60 * 1000

const PLANS_BY_PRODUCT: Record<string, Record<string, {
    price: { monthly: number; yearly: number }
    priceIds?: { monthly: string; yearly: string }
}>> = {
    bundle: BUNDLE_PLANS,
    alias: ALIAS_PLANS,
    drop: DROP_PLANS,
    form: FORM_PLANS,
}

/**
 * Monthly USD "book MRR" for one subscription row, at current list prices.
 * Interval is inferred by matching providerPriceId against the configured
 * Stripe price ids; yearly prices are normalized to monthly (÷ 12). Rows with
 * an unrecognized price id (legacy/manual grants) fall back to the monthly
 * list price. Stripe settles in EUR, but book MRR in USD is the operational
 * metric the CEO dashboard tracks (see docs/analytics-events.md).
 */
function monthlyUsdFor(sub: {
    product: string
    tier: string
    seats: number
    providerPriceId: string | null
}): number {
    const seats = Math.max(sub.seats, 1)
    if (sub.product === "business") {
        const yearlyId = BUSINESS_PLAN.priceIds?.yearly
        if (yearlyId && sub.providerPriceId === yearlyId) {
            return (BUSINESS_SEAT_PRICE.yearly / 12) * seats
        }
        return BUSINESS_SEAT_PRICE.monthly * seats
    }
    const plan = PLANS_BY_PRODUCT[sub.product]?.[sub.tier]
    if (!plan) return 0
    if (plan.priceIds?.yearly && sub.providerPriceId === plan.priceIds.yearly) {
        return plan.price.yearly / 12
    }
    return plan.price.monthly
}

/**
 * Emit the daily `business_snapshot` event — DB facts (MRR, alias-active
 * users) that PostHog cannot observe directly. Fixed distinctId
 * "business_metrics": this is an operational metric, not a user event.
 */
export async function handleBusinessSnapshotCron(): Promise<{
    emitted: boolean
    mrrUsd: number
    aliasActiveUsers30d: number
    activeSubscriptions: number
    totalRegisteredUsers: number
}> {
    const [activeSubs, aliasActiveGroups, totalRegisteredUsers] = await Promise.all([
        prisma.subscription.findMany({
            where: { status: { in: ["active", "trialing"] } },
            select: { product: true, tier: true, seats: true, providerPriceId: true },
        }),
        // Distinct owners of aliases that received mail in the last 30 days.
        prisma.alias.groupBy({
            by: ["userId"],
            where: {
                userId: { not: null },
                lastEmailAt: { gt: new Date(Date.now() - 30 * DAY_MS) },
            },
        }),
        prisma.user.count(),
    ])

    const mrrUsd = Math.round(
        activeSubs.reduce((sum, sub) => sum + monthlyUsdFor(sub), 0) * 100,
    ) / 100

    const snapshot = {
        mrr_usd: mrrUsd,
        alias_active_users_30d: aliasActiveGroups.length,
        active_subscriptions: activeSubs.length,
        total_registered_users: totalRegisteredUsers,
        snapshot_date: new Date().toISOString().slice(0, 10),
    }

    captureServerEvent("business_metrics", "business_snapshot", snapshot)
    // Cron context: flush before the route responds so the serverless runtime
    // can't kill the in-flight request.
    await flushPostHog()

    logger.info("Business snapshot emitted", snapshot)
    return {
        emitted: true,
        mrrUsd,
        aliasActiveUsers30d: aliasActiveGroups.length,
        activeSubscriptions: activeSubs.length,
        totalRegisteredUsers,
    }
}
