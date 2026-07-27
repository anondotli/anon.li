import { describe, expect, it } from "vitest"

import { ALIAS_PLANS, BUNDLE_PLANS, DROP_PLANS, FORM_PLANS, PLAN_ENTITLEMENTS } from "@/config/plans"

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

    it("pins thousands separators to en-US comma form", () => {
        // Regression guard for React hydration error #418: these strings are
        // SSR'd, so locale-dependent separators ("1.000" in de-DE, "1 000" in
        // fr-FR) made the server HTML diverge from the client render for
        // non-English visitors.
        expect(FORM_PLANS.free.missingFeatures).toContain("1,000 submissions/month")
        expect(FORM_PLANS.plus.missingFeatures).toContain("10,000 submissions/month")
        expect(ALIAS_PLANS.plus.features).toContain("25,000 API requests/month")
    })

    it("never emits locale-dependent separators in any plan string", () => {
        const strings: string[] = []
        for (const plans of [ALIAS_PLANS, DROP_PLANS, FORM_PLANS, BUNDLE_PLANS]) {
            for (const plan of Object.values(plans)) {
                strings.push(...plan.features, ...plan.missingFeatures)
                for (const section of plan.featureSections ?? []) {
                    strings.push(...section.features, ...(section.missingFeatures ?? []))
                }
            }
        }
        // de-DE dot grouping, fr-FR space/narrow-space grouping — anything but
        // the en-US comma breaks hydration.
        const localeSeparators = /\d[.\u00a0\u2009\u202f ]\d{3}\b/
        for (const s of strings) {
            expect(s, s).not.toMatch(localeSeparators)
        }
    })
})
