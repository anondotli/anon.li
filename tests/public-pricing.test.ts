import { describe, expect, it } from "vitest"

import { getPricingJsonLd, getPublicPricingCatalog } from "@/lib/public-pricing"

describe("public pricing catalog", () => {
    it("publishes every product and tier without Stripe price IDs", () => {
        const catalog = getPublicPricingCatalog()
        const serialized = JSON.stringify(catalog)

        expect(catalog.url).toBe("https://anon.li/pricing")
        expect(catalog.products.map((product) => product.id)).toEqual(["bundle", "alias", "drop"])

        for (const product of catalog.products) {
            expect(product.plans.map((plan) => plan.tier)).toEqual(["free", "plus", "pro"])

            for (const plan of product.plans) {
                expect("priceIds" in plan).toBe(false)
                expect(plan.featureGroups.length).toBeGreaterThan(0)
            }
        }

        expect(serialized).not.toContain("stripe")
        expect(serialized).not.toContain("STRIPE")
    })

    it("keeps known public prices readable", () => {
        const catalog = getPublicPricingCatalog()
        const bundle = catalog.products.find((product) => product.id === "bundle")
        const bundlePlus = bundle?.plans.find((plan) => plan.tier === "plus")
        const aliasPro = catalog.products
            .find((product) => product.id === "alias")
            ?.plans.find((plan) => plan.tier === "pro")

        expect(bundlePlus?.prices.monthly).toBe(3.99)
        expect(bundlePlus?.prices.yearly).toBe(39.49)
        expect(bundlePlus?.prices.yearlyEquivalentMonthly).toBe(3.29)
        expect(aliasPro?.entitlements.alias?.randomAliases).toBe("unlimited")
    })

    it("exposes OfferCatalog structured data for pricing crawlers", () => {
        const jsonLd = getPricingJsonLd()
        const serialized = JSON.stringify(jsonLd)

        expect(serialized).toContain("OfferCatalog")
        expect(serialized).toContain("Bundle Plus monthly plan")
        expect(serialized).toContain("UnitPriceSpecification")
        expect(serialized).toContain("P1Y")
    })
})
