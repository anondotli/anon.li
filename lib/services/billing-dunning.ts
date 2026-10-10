import type { Prisma } from "@prisma/client"
import { DAY_MS } from "@/lib/constants"

/**
 * A personal Stripe subscription still in dunning: locally `past_due` (Stripe
 * past_due/incomplete — or unpaid/paused before its terminal loss was
 * recorded) with no recorded terminal loss. Stripe may still recover it, so
 * destructive downgrade effects (resource deletion, Form retention purge)
 * must not run yet.
 */
export const dunningSubscriptionWhere = {
    organizationId: null,
    provider: "stripe",
    status: "past_due",
    lossNotifiedAt: null,
} satisfies Prisma.SubscriptionWhereInput

/**
 * Upper bound on how long dunning may hold back destructive effects, measured
 * from the user's downgrade marker. Stripe's retry schedule tops out at two
 * months; a row stuck in past_due beyond that (e.g. a terminal state reached
 * before loss tracking existed) no longer protects anything.
 */
export const MAX_DUNNING_DAYS = 62

/** Whether a dunning row may still hold back destructive effects. */
export function isWithinDunningWindow(downgradedAt: Date | null, now = Date.now()): boolean {
    return !downgradedAt || downgradedAt.getTime() > now - MAX_DUNNING_DAYS * DAY_MS
}

/** Whether a subscription row (as selected) is in dunning. */
export function isDunningSubscription(sub: {
    provider: string
    status: string
    lossNotifiedAt: Date | null
}): boolean {
    return sub.provider === "stripe" && sub.status === "past_due" && sub.lossNotifiedAt === null
}

/**
 * Where-clause for a Stripe subscription (personal or org — add the owner
 * filter) that is genuinely in dunning right now: past_due with no recorded
 * terminal loss, and synced within the dunning bound. A row whose terminal
 * webhook was missed, or that was parked as past_due for an ownership error,
 * ages out instead of blocking checkout forever (reconciliation re-fetches
 * old past_due rows so they heal).
 */
export function recentDunningWhere(now = Date.now()) {
    return {
        provider: "stripe",
        status: "past_due",
        lossNotifiedAt: null,
        updatedAt: { gt: new Date(now - MAX_DUNNING_DAYS * DAY_MS) },
    } satisfies Prisma.SubscriptionWhereInput
}
