/**
 * Promotions: the Black Friday window (Nov 1 – Dec 6 23:59 UTC) and the rule
 * that paying customers — personal subscribers, subscriptions in dunning and
 * members of a paid team — are never offered a promotion.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const subscriptionFindFirst = vi.hoisted(() => vi.fn())

vi.mock("@/lib/prisma", () => ({
    prisma: { subscription: { findFirst: subscriptionFindFirst } },
}))

import { getActivePromotion } from "@/config/promotions"
import { getPromotionForUser } from "@/lib/promotions"

const START = Date.parse("2026-11-01T00:00:00Z")
const END = Date.parse("2026-12-06T23:59:00Z")
const DURING = Date.parse("2026-11-27T12:00:00Z")

describe("getActivePromotion", () => {
    it("is not running before Nov 1 (UTC)", () => {
        expect(getActivePromotion(START - 1)).toBeNull()
    })

    it("starts at Nov 1 00:00 UTC with BLKFRI40: 40% off for 12 months", () => {
        expect(getActivePromotion(START)).toMatchObject({
            code: "BLKFRI40",
            percentOff: 40,
            durationMonths: 12,
        })
    })

    it("is still running the instant before Dec 6 23:59 UTC", () => {
        expect(getActivePromotion(END - 1)?.code).toBe("BLKFRI40")
    })

    it("ends at Dec 6 23:59 UTC, when the Stripe code expires", () => {
        expect(getActivePromotion(END)).toBeNull()
    })
})

describe("getPromotionForUser", () => {
    beforeEach(() => {
        subscriptionFindFirst.mockReset()
    })

    it("returns nothing outside the window without touching the database", async () => {
        expect(await getPromotionForUser("user-1", END)).toBeNull()
        expect(subscriptionFindFirst).not.toHaveBeenCalled()
    })

    it("offers the promotion to signed-out visitors without a lookup", async () => {
        expect((await getPromotionForUser(null, DURING))?.code).toBe("BLKFRI40")
        expect(subscriptionFindFirst).not.toHaveBeenCalled()
    })

    it("offers the promotion to a signed-in user who doesn't pay", async () => {
        subscriptionFindFirst.mockResolvedValue(null)
        expect((await getPromotionForUser("user-1", DURING))?.code).toBe("BLKFRI40")
    })

    it("hides the promotion from a paying customer", async () => {
        subscriptionFindFirst.mockResolvedValue({ id: "sub-1" })
        expect(await getPromotionForUser("user-1", DURING)).toBeNull()
    })

    it("treats live personal plans, dunning and paid team seats as paying", async () => {
        subscriptionFindFirst.mockResolvedValue(null)
        await getPromotionForUser("user-1", DURING)

        const clauses = subscriptionFindFirst.mock.calls[0]![0].where.OR as Record<string, unknown>[]
        const personal = clauses.filter((c) => c.userId === "user-1" && c.organizationId === null)
        const team = clauses.filter((c) => c.organization !== undefined)

        // Live (active/trialing) and in-dunning (past_due) subscriptions, both personal and team.
        for (const group of [personal, team]) {
            expect(group).toHaveLength(2)
            expect(group).toContainEqual(expect.objectContaining({ status: { in: ["active", "trialing"] } }))
            expect(group).toContainEqual(expect.objectContaining({ status: "past_due" }))
        }
        for (const clause of team) {
            expect(clause.organization).toEqual({ members: { some: { userId: "user-1" } } })
        }
    })
})
