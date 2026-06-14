import { describe, it, expect } from "vitest"
import { getPlanLimits, getDropLimits, getEffectiveTier } from "@/lib/limits"
import { PLAN_ENTITLEMENTS } from "@/config/plans"

function withSub(product: string, tier: string) {
    return {
        subscriptions: [{ status: "active", product, tier, currentPeriodEnd: null }],
        referralPlusUntil: null,
    }
}

describe("business (Teams) plan entitlements", () => {
    it("a business subscription grants Pro alias limits", () => {
        expect(getPlanLimits(withSub("business", "pro"))).toEqual(PLAN_ENTITLEMENTS.alias.pro)
    })

    it("a business subscription grants Pro drop limits across products", () => {
        expect(getDropLimits(withSub("business", "pro")).maxFileSize).toBe(PLAN_ENTITLEMENTS.drop.pro.maxFileSize)
    })

    it("a business subscription resolves to an effective Pro tier", () => {
        expect(getEffectiveTier(withSub("business", "pro"))).toBe("pro")
    })

    it("does not over-grant: no subscription stays on the free drop limits", () => {
        const free = { subscriptions: [], referralPlusUntil: null }
        expect(getDropLimits(free).maxFileSize).toBe(PLAN_ENTITLEMENTS.drop.free.maxFileSize)
        expect(getEffectiveTier(free)).toBe("free")
    })

    it("a single-product alias sub does NOT grant drop limits (regression guard)", () => {
        expect(getDropLimits(withSub("alias", "pro")).maxFileSize).toBe(PLAN_ENTITLEMENTS.drop.free.maxFileSize)
    })
})
