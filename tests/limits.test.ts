import { describe, expect, it } from "vitest"

import {
    ALIAS_LIMITS,
    EXPIRY_LIMITS,
    STORAGE_LIMITS,
} from "@/config/plans"
import {
    getDisplayPlanLimits,
    getDropLimits,
    getEffectiveTier,
    getPlanLimits,
    getPlanLimitsAsync,
    getRecipientLimit,
    type SubscriptionLike,
} from "@/lib/limits"

import { vi } from "vitest"

const futureDate = () => {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    return d
}

const expiredDate = () => {
    const d = new Date()
    d.setDate(d.getDate() - 10)
    return d
}

const recentlyExpiredDate = () => {
    const d = new Date()
    d.setHours(d.getHours() - 12)
    return d
}

function sub(product: string, tier: string, end: Date | null, status = "active"): SubscriptionLike {
    return { status, product, tier, currentPeriodEnd: end }
}

describe("getPlanLimits", () => {
    it("returns free limits for undefined users", () => {
        expect(getPlanLimits(undefined)).toEqual(ALIAS_LIMITS.free)
    })

    it("returns paid alias limits for active bundle subscriptions", () => {
        expect(getPlanLimits({
            subscriptions: [sub("bundle", "plus", futureDate())],
        })).toEqual(ALIAS_LIMITS.plus)

        expect(getPlanLimits({
            subscriptions: [sub("bundle", "pro", futureDate())],
        })).toEqual(ALIAS_LIMITS.pro)
    })

    it("falls back to free limits for expired subscriptions", () => {
        expect(getPlanLimits({
            subscriptions: [sub("bundle", "pro", expiredDate())],
        })).toEqual(ALIAS_LIMITS.free)
    })

    it("returns free alias limits for drop-only subscriptions", () => {
        expect(getPlanLimits({
            subscriptions: [sub("drop", "plus", futureDate())],
        })).toEqual(ALIAS_LIMITS.free)
    })
})

describe("getDropLimits", () => {
    it("returns free limits for undefined users", () => {
        const result = getDropLimits(undefined)

        expect(result.maxStorage).toBe(STORAGE_LIMITS.free)
        expect(result.maxExpiry).toBe(EXPIRY_LIMITS.free)
    })

    it("returns paid drop limits for active drop subscriptions", () => {
        expect(getDropLimits({
            subscriptions: [sub("drop", "plus", futureDate())],
        }).maxStorage).toBe(STORAGE_LIMITS.plus)
    })

    it("returns free drop limits for alias-only subscriptions", () => {
        const result = getDropLimits({
            subscriptions: [sub("alias", "plus", futureDate())],
        })

        expect(result.maxStorage).toBe(STORAGE_LIMITS.free)
        expect(result.maxExpiry).toBe(EXPIRY_LIMITS.free)
    })
})

describe("getDisplayPlanLimits", () => {
    it("keeps the public pro alias display unlimited", () => {
        expect(getDisplayPlanLimits({
            subscriptions: [sub("bundle", "pro", futureDate())],
        })).toEqual(ALIAS_LIMITS.pro)
    })

    it("keeps visible limits unchanged for non-pro users", () => {
        expect(getDisplayPlanLimits({
            subscriptions: [sub("bundle", "plus", futureDate())],
        })).toEqual(ALIAS_LIMITS.plus)
    })
})

describe("getEffectiveTier", () => {
    it("returns the highest active tier and honors the grace period", () => {
        expect(getEffectiveTier({
            subscriptions: [sub("bundle", "plus", futureDate())],
        })).toBe("plus")

        // Within grace period (DAY_MS) the recently-expired subscription still counts.
        expect(getEffectiveTier({
            subscriptions: [sub("bundle", "pro", recentlyExpiredDate())],
        })).toBe("pro")
    })

    it("falls back to free outside the grace period or without a renewal date", () => {
        expect(getEffectiveTier({
            subscriptions: [sub("bundle", "pro", expiredDate())],
        })).toBe("free")
        // No active subscriptions at all.
        expect(getEffectiveTier({ subscriptions: [] })).toBe("free")
    })

    it("ignores canceled subscriptions even if currentPeriodEnd is in the future", () => {
        expect(getEffectiveTier({
            subscriptions: [sub("bundle", "pro", futureDate(), "canceled")],
        })).toBe("free")
    })
})

describe("getRecipientLimit", () => {
    it("uses alias entitlements for active plans", () => {
        expect(getRecipientLimit(undefined)).toBe(ALIAS_LIMITS.free.recipients)
        expect(getRecipientLimit({
            subscriptions: [sub("bundle", "plus", futureDate())],
        })).toBe(ALIAS_LIMITS.plus.recipients)
        expect(getRecipientLimit({
            subscriptions: [sub("alias", "pro", futureDate())],
        })).toBe(ALIAS_LIMITS.pro.recipients)
    })
})

vi.mock("@/lib/entitlements", () => ({
    getEffectiveTiers: vi.fn(),
}))

describe("getPlanLimitsAsync", () => {
    it("preserves unlimited pro random aliases for async entitlement resolution", async () => {
        const { getEffectiveTiers } = await import("@/lib/entitlements")
        vi.mocked(getEffectiveTiers).mockResolvedValue({
            alias: "pro",
            drop: "free",
            form: "free",
        })

        await expect(getPlanLimitsAsync("user-123")).resolves.toEqual(ALIAS_LIMITS.pro)
    })
})
