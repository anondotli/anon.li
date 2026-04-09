import { describe, it, expect } from "vitest"

import { ALIAS_PLANS, BUNDLE_PLANS, PLAN_ENTITLEMENTS } from "@/config/plans"

describe("plan feature strings", () => {
    it("keeps pro random aliases public-facing as unlimited", () => {
        expect(PLAN_ENTITLEMENTS.alias.pro.random).toBe(-1)
    })

    it("renders unlimited alias wording for alias pro", () => {
        expect(ALIAS_PLANS.pro.features).toContain("Unlimited email aliases")
        expect(ALIAS_PLANS.pro.features.some((feature) => feature.includes("-1 aliases"))).toBe(false)
        expect(ALIAS_PLANS.pro.features.some((feature) => feature.includes("-1 email aliases"))).toBe(false)
    })

    it("renders unlimited alias wording in plus upgrade prompts", () => {
        expect(ALIAS_PLANS.plus.missingFeatures).toContain("Unlimited aliases")
        expect(ALIAS_PLANS.plus.missingFeatures.some((feature) => feature.includes("-1 aliases"))).toBe(false)
    })

    it("propagates unlimited alias wording to bundle pro pricing", () => {
        const aliasSection = BUNDLE_PLANS.pro.featureSections?.find((section) => section.name === "Alias Features")

        expect(aliasSection?.features).toContain("Unlimited email aliases")
        expect(aliasSection?.features.some((feature) => feature.includes("-1 aliases"))).toBe(false)
        expect(aliasSection?.features.some((feature) => feature.includes("-1 email aliases"))).toBe(false)
    })
})
