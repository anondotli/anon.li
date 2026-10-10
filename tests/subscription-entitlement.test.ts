/**
 * @vitest-environment node
 *
 * One shared definition of an "active team subscription" (entitling status AND
 * period not lapsed past the access grace) used by the team page, team checkout
 * guard, seat limit, member entitlement inheritance and the org create gate.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const { subscriptionFindFirst, memberCount, invitationCount } = vi.hoisted(() => ({
    subscriptionFindFirst: vi.fn(),
    memberCount: vi.fn(),
    invitationCount: vi.fn(),
}))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/prisma", () => ({
    prisma: { subscription: { findFirst: subscriptionFindFirst }, member: { count: memberCount }, invitation: { count: invitationCount } },
}))

import {
    activeTeamSubscriptionWhere,
    entitlingSubscriptionWhere,
    isEntitlingSubscription,
    SUBSCRIPTION_ACCESS_GRACE_MS,
} from "@/lib/subscription-entitlement"
import { assertOrgPlanActive, getPlanLimits } from "@/lib/limits"
import { UpgradeRequiredError } from "@/lib/api-error-utils"
import { FREE_TEAM_MEMBER_LIMIT, getOrgSeatLimit, getOrgSeatUsage } from "@/lib/org-seats"

const NOW = Date.UTC(2026, 9, 10, 12)
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000)

beforeEach(() => {
    vi.clearAllMocks()
})

describe("isEntitlingSubscription", () => {
    it("requires an entitling status", () => {
        expect(isEntitlingSubscription({ status: "active", currentPeriodEnd: null }, NOW)).toBe(true)
        expect(isEntitlingSubscription({ status: "trialing", currentPeriodEnd: null }, NOW)).toBe(true)
        expect(isEntitlingSubscription({ status: "past_due", currentPeriodEnd: null }, NOW)).toBe(false)
        expect(isEntitlingSubscription({ status: "canceled", currentPeriodEnd: null }, NOW)).toBe(false)
    })

    it("stops entitling once the period lapses past the access grace", () => {
        expect(isEntitlingSubscription({ status: "active", currentPeriodEnd: hoursAgo(12) }, NOW)).toBe(true)
        expect(isEntitlingSubscription({ status: "active", currentPeriodEnd: hoursAgo(25) }, NOW)).toBe(false)
    })
})

describe("entitlingSubscriptionWhere / activeTeamSubscriptionWhere", () => {
    it("mirrors the predicate in Prisma, evaluated per call", () => {
        expect(entitlingSubscriptionWhere(NOW)).toEqual({
            status: { in: ["active", "trialing"] },
            OR: [
                { currentPeriodEnd: null },
                { currentPeriodEnd: { gt: new Date(NOW - SUBSCRIPTION_ACCESS_GRACE_MS) } },
            ],
        })
        expect(activeTeamSubscriptionWhere("org-1", NOW)).toMatchObject({ organizationId: "org-1" })
    })
})

describe("consumers share the definition", () => {
    it("assertOrgPlanActive rejects an org whose only 'active' row has lapsed", () => {
        expect(() => assertOrgPlanActive(
            { subscriptions: [{ status: "active", currentPeriodEnd: new Date(Date.now() - 3 * 86_400_000) }] },
            "aliases",
            "alias_random",
        )).toThrow(UpgradeRequiredError)
        expect(() => assertOrgPlanActive(
            { subscriptions: [{ status: "active", currentPeriodEnd: new Date(Date.now() + 86_400_000) }] },
            "aliases",
            "alias_random",
        )).not.toThrow()
    })

    it("plan limits ignore a lapsed team row", () => {
        const lapsed = { status: "active", product: "business", tier: "pro", currentPeriodEnd: new Date(Date.now() - 3 * 86_400_000) }
        expect(getPlanLimits({ subscriptions: [lapsed] })).toEqual(getPlanLimits({ subscriptions: [] }))
    })

    it("getOrgSeatLimit only counts entitling team subscriptions", async () => {
        subscriptionFindFirst.mockResolvedValueOnce(null)
        expect(await getOrgSeatLimit("org-1")).toBe(FREE_TEAM_MEMBER_LIMIT)
        const where = subscriptionFindFirst.mock.calls[0]![0].where
        expect(where).toMatchObject({ organizationId: "org-1", status: { in: ["active", "trialing"] } })
        expect(where.OR).toHaveLength(2)

        subscriptionFindFirst.mockResolvedValueOnce({ seats: 7 })
        expect(await getOrgSeatLimit("org-1")).toBe(7)
    })
})

describe("getOrgSeatUsage", () => {
    it("reports members plus pending, unexpired invitations against the seat limit", async () => {
        subscriptionFindFirst.mockResolvedValueOnce({ seats: 5 })
        memberCount.mockResolvedValueOnce(3)
        invitationCount.mockResolvedValueOnce(1)
        const now = new Date(NOW)

        expect(await getOrgSeatUsage("org-1", now)).toEqual({ limit: 5, members: 3, pendingInvitations: 1 })
        expect(invitationCount).toHaveBeenCalledWith({
            where: { organizationId: "org-1", status: "pending", expiresAt: { gt: now } },
        })
    })
})
