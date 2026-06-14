/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// vi.hoisted so the mock factory (also hoisted) can reference these.
const { findUnique, findMany } = vi.hoisted(() => ({
    findUnique: vi.fn(),
    findMany: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
    prisma: {
        user: { findUnique },
        subscription: { findMany },
    },
}))

import { getAuthUserState } from "@/lib/data/auth"
import { getEffectiveTier, getPlanLimits } from "@/lib/limits"
import { PLAN_ENTITLEMENTS } from "@/config/plans"

const baseUser = {
    id: "u1",
    isAdmin: false,
    banned: false,
    twoFactorEnabled: false,
    referralPlusUntil: null,
    deletionRequest: null,
}

describe("org entitlement inheritance (seat-based)", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("merges the org's Business subscription into a member's entitlements", async () => {
        findUnique.mockResolvedValue({
            ...baseUser,
            subscriptions: [], // no personal subscription
            memberships: [{ organizationId: "org1", role: "member" }],
        })
        findMany.mockResolvedValue([
            { status: "active", product: "business", tier: "pro", currentPeriodEnd: null },
        ])

        const state = await getAuthUserState("u1")
        expect(state).not.toBeNull()
        expect(state!.subscriptions).toHaveLength(1)
        // A business sub grants Pro across every product.
        expect(getEffectiveTier(state)).toBe("pro")
        expect(getPlanLimits(state)).toEqual(PLAN_ENTITLEMENTS.alias.pro)
        expect(findMany).toHaveBeenCalledTimes(1)
    })

    it("does not query org subs (or grant anything) for a user with no memberships", async () => {
        findUnique.mockResolvedValue({
            ...baseUser,
            subscriptions: [],
            memberships: [],
        })

        const state = await getAuthUserState("u1")
        expect(state!.subscriptions).toHaveLength(0)
        expect(getEffectiveTier(state)).toBe("free")
        expect(findMany).not.toHaveBeenCalled()
    })

    it("keeps a personal Pro sub when the org has none", async () => {
        findUnique.mockResolvedValue({
            ...baseUser,
            subscriptions: [{ status: "active", product: "bundle", tier: "pro", currentPeriodEnd: null }],
            memberships: [{ organizationId: "org1", role: "admin" }],
        })
        findMany.mockResolvedValue([]) // org has no subscription

        const state = await getAuthUserState("u1")
        expect(getEffectiveTier(state)).toBe("pro")
    })
})
