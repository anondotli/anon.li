import { describe, expect, it } from "vitest"

import {
    ALIAS_LIMITS,
    ALIAS_PLANS,
    BUNDLE_PLANS,
    DROP_PLANS,
    EXPIRY_LIMITS,
    STORAGE_LIMITS,
} from "@/config/plans"
import {
    getDisplayPlanLimits,
    getDropLimits,
    getEffectiveTier,
    getPlanLimits,
    getPlanLimitsAsync,
    getProductFromPriceId,
    getRecipientLimit,
} from "@/lib/limits"

import { vi } from "vitest"

const PRICE_IDS = {
    bundlePlus: BUNDLE_PLANS.plus.priceIds!.monthly,
    bundlePro: BUNDLE_PLANS.pro.priceIds!.monthly,
    aliasPlus: ALIAS_PLANS.plus.priceIds!.monthly,
    aliasPro: ALIAS_PLANS.pro.priceIds!.monthly,
    dropPlus: DROP_PLANS.plus.priceIds!.monthly,
} as const

describe("getPlanLimits", () => {
    it("returns free limits for undefined users", () => {
        expect(getPlanLimits(undefined)).toEqual(ALIAS_LIMITS.free)
    })

    it("returns paid alias limits for active bundle subscriptions", () => {
        const futureDate = new Date()
        futureDate.setDate(futureDate.getDate() + 30)

        expect(getPlanLimits({
            stripePriceId: PRICE_IDS.bundlePlus,
            stripeCurrentPeriodEnd: futureDate,
        })).toEqual(ALIAS_LIMITS.plus)

        expect(getPlanLimits({
            stripePriceId: PRICE_IDS.bundlePro,
            stripeCurrentPeriodEnd: futureDate,
        })).toEqual(ALIAS_LIMITS.pro)
    })

    it("falls back to free limits for expired subscriptions", () => {
        const expiredDate = new Date()
        expiredDate.setDate(expiredDate.getDate() - 10)

        expect(getPlanLimits({
            stripePriceId: PRICE_IDS.bundlePro,
            stripeCurrentPeriodEnd: expiredDate,
        })).toEqual(ALIAS_LIMITS.free)
    })

    it("returns free alias limits for drop-only subscriptions", () => {
        const futureDate = new Date()
        futureDate.setDate(futureDate.getDate() + 30)

        expect(getPlanLimits({
            stripePriceId: PRICE_IDS.dropPlus,
            stripeCurrentPeriodEnd: futureDate,
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
        const futureDate = new Date()
        futureDate.setDate(futureDate.getDate() + 30)

        expect(getDropLimits({
            stripePriceId: PRICE_IDS.dropPlus,
            stripeCurrentPeriodEnd: futureDate,
        }).maxStorage).toBe(STORAGE_LIMITS.plus)
    })

    it("returns free drop limits for alias-only subscriptions", () => {
        const futureDate = new Date()
        futureDate.setDate(futureDate.getDate() + 30)

        const result = getDropLimits({
            stripePriceId: PRICE_IDS.aliasPlus,
            stripeCurrentPeriodEnd: futureDate,
        })

        expect(result.maxStorage).toBe(STORAGE_LIMITS.free)
        expect(result.maxExpiry).toBe(EXPIRY_LIMITS.free)
    })
})

describe("getDisplayPlanLimits", () => {
    it("keeps the public pro alias display unlimited", () => {
        const futureDate = new Date()
        futureDate.setDate(futureDate.getDate() + 30)

        expect(getDisplayPlanLimits({
            stripePriceId: PRICE_IDS.bundlePro,
            stripeCurrentPeriodEnd: futureDate,
        })).toEqual(ALIAS_LIMITS.pro)
    })

    it("keeps visible limits unchanged for non-pro users", () => {
        const futureDate = new Date()
        futureDate.setDate(futureDate.getDate() + 30)

        expect(getDisplayPlanLimits({
            stripePriceId: PRICE_IDS.bundlePlus,
            stripeCurrentPeriodEnd: futureDate,
        })).toEqual(ALIAS_LIMITS.plus)
    })
})

describe("getEffectiveTier", () => {
    it("returns the highest active tier and honors the grace period", () => {
        const futureDate = new Date()
        futureDate.setDate(futureDate.getDate() + 30)

        expect(getEffectiveTier({
            stripePriceId: PRICE_IDS.bundlePlus,
            stripeCurrentPeriodEnd: futureDate,
        })).toBe("plus")

        const recentlyExpired = new Date()
        recentlyExpired.setHours(recentlyExpired.getHours() - 12)

        expect(getEffectiveTier({
            stripePriceId: PRICE_IDS.bundlePro,
            stripeCurrentPeriodEnd: recentlyExpired,
        })).toBe("pro")
    })

    it("falls back to free outside the grace period or without a renewal date", () => {
        const expiredDate = new Date()
        expiredDate.setDate(expiredDate.getDate() - 10)

        expect(getEffectiveTier({
            stripePriceId: PRICE_IDS.bundlePro,
            stripeCurrentPeriodEnd: expiredDate,
        })).toBe("free")
        expect(getEffectiveTier({ stripePriceId: PRICE_IDS.bundlePro })).toBe("free")
    })
})

describe("getProductFromPriceId", () => {
    it("maps known price IDs to products", () => {
        expect(getProductFromPriceId(PRICE_IDS.bundlePlus)).toBe("bundle")
        expect(getProductFromPriceId(PRICE_IDS.aliasPlus)).toBe("alias")
        expect(getProductFromPriceId(PRICE_IDS.dropPlus)).toBe("drop")
        expect(getProductFromPriceId("price_unknown")).toBeNull()
    })
})

describe("getRecipientLimit", () => {
    it("uses alias entitlements for active plans", () => {
        const futureDate = new Date()
        futureDate.setDate(futureDate.getDate() + 30)

        expect(getRecipientLimit(undefined)).toBe(ALIAS_LIMITS.free.recipients)
        expect(getRecipientLimit({
            stripePriceId: PRICE_IDS.bundlePlus,
            stripeCurrentPeriodEnd: futureDate,
        })).toBe(ALIAS_LIMITS.plus.recipients)
        expect(getRecipientLimit({
            stripePriceId: PRICE_IDS.aliasPro,
            stripeCurrentPeriodEnd: futureDate,
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
