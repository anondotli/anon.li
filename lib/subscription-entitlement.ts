import type { Prisma } from "@prisma/client"
import { DAY_MS } from "@/lib/constants"

/**
 * Single definition of "this subscription row currently entitles its owner"
 * — used for personal plan resolution (lib/limits) and, critically, for team
 * (organization) subscriptions: the team page, the team-checkout duplicate
 * guard, the seat limit, member entitlement inheritance and the purchase-first
 * org gate (assertOrgPlanActive) must all agree, or a lapsed team plan can keep
 * unlocking one surface while another treats the team as unsubscribed.
 *
 * Pure (no prisma client import) so client-safe modules can share it.
 */

/** Subscription statuses that grant access. */
const ENTITLING_SUBSCRIPTION_STATUSES = ["active", "trialing"] as const

/**
 * Access grace after `currentPeriodEnd` before a still-"active" row stops
 * entitling: absorbs renewal-webhook lag without letting a missed webhook keep
 * a plan alive indefinitely. A null period end (manual/admin grants) entitles.
 */
export const SUBSCRIPTION_ACCESS_GRACE_MS = DAY_MS

export type EntitlementCheckable = {
    status: string
    currentPeriodEnd?: Date | null
}

/** Whether a subscription row currently entitles its owner. */
export function isEntitlingSubscription(sub: EntitlementCheckable, now: number = Date.now()): boolean {
    if (!(ENTITLING_SUBSCRIPTION_STATUSES as readonly string[]).includes(sub.status)) return false
    if (sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() + SUBSCRIPTION_ACCESS_GRACE_MS < now) return false
    return true
}

/**
 * Prisma filter equivalent of {@link isEntitlingSubscription}. A function (not a
 * constant) so the period cut-off is evaluated per query, never at module load.
 * Combine with other OR clauses via `AND: [...]` — it owns an `OR`.
 */
export function entitlingSubscriptionWhere(now: number = Date.now()) {
    return {
        status: { in: [...ENTITLING_SUBSCRIPTION_STATUSES] },
        OR: [
            { currentPeriodEnd: null },
            { currentPeriodEnd: { gt: new Date(now - SUBSCRIPTION_ACCESS_GRACE_MS) } },
        ],
    } satisfies Prisma.SubscriptionWhereInput
}

/** Active (entitling) subscription rows owned by a team/organization. */
export function activeTeamSubscriptionWhere(organizationId: string, now: number = Date.now()) {
    return {
        organizationId,
        ...entitlingSubscriptionWhere(now),
    } satisfies Prisma.SubscriptionWhereInput
}
