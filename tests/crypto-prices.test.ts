import { describe, expect, it, vi } from "vitest"

// config/plans.ts reads the Stripe price ids at module load; vitest.setup.ts
// seeds everything except the Form plans, so seed those here before import.
vi.hoisted(() => {
    process.env.STRIPE_FORM_PLUS_MONTHLY_PRICE_ID ??= "price_form_plus_monthly"
    process.env.STRIPE_FORM_PLUS_YEARLY_PRICE_ID ??= "price_form_plus_yearly"
    process.env.STRIPE_FORM_PRO_MONTHLY_PRICE_ID ??= "price_form_pro_monthly"
    process.env.STRIPE_FORM_PRO_YEARLY_PRICE_ID ??= "price_form_pro_yearly"
    return {}
})

import {
    getCryptoPrice,
    getCryptoIntervalForStripePriceId,
    isValidCryptoInterval,
    isValidCryptoProduct,
    isValidCryptoTier,
} from "@/lib/crypto-prices"

describe("crypto-prices", () => {
    describe("isValidCryptoProduct", () => {
        it("accepts valid products", () => {
            expect(isValidCryptoProduct("bundle")).toBe(true)
            expect(isValidCryptoProduct("alias")).toBe(true)
            expect(isValidCryptoProduct("drop")).toBe(true)
        })

        it("rejects invalid products", () => {
            expect(isValidCryptoProduct("invalid")).toBe(false)
            expect(isValidCryptoProduct("")).toBe(false)
            expect(isValidCryptoProduct(null)).toBe(false)
            expect(isValidCryptoProduct(123)).toBe(false)
        })
    })

    describe("isValidCryptoTier", () => {
        it("accepts valid tiers", () => {
            expect(isValidCryptoTier("plus")).toBe(true)
            expect(isValidCryptoTier("pro")).toBe(true)
        })

        it("rejects invalid tiers", () => {
            expect(isValidCryptoTier("free")).toBe(false)
            expect(isValidCryptoTier("guest")).toBe(false)
            expect(isValidCryptoTier("")).toBe(false)
            expect(isValidCryptoTier(null)).toBe(false)
        })
    })

    describe("isValidCryptoInterval", () => {
        it("accepts valid intervals", () => {
            expect(isValidCryptoInterval("monthly")).toBe(true)
            expect(isValidCryptoInterval("yearly")).toBe(true)
        })

        it("rejects invalid intervals", () => {
            expect(isValidCryptoInterval("weekly")).toBe(false)
            expect(isValidCryptoInterval("")).toBe(false)
            expect(isValidCryptoInterval(null)).toBe(false)
            expect(isValidCryptoInterval(12)).toBe(false)
        })
    })

    describe("getCryptoPrice", () => {
        const combos: Array<["bundle" | "alias" | "drop" | "form", "plus" | "pro"]> = [
            ["bundle", "plus"],
            ["bundle", "pro"],
            ["alias", "plus"],
            ["alias", "pro"],
            ["drop", "plus"],
            ["drop", "pro"],
            ["form", "plus"],
            ["form", "pro"],
        ]

        it("returns yearly prices for all valid product/tier combinations by default", () => {
            for (const [product, tier] of combos) {
                const price = getCryptoPrice(product, tier)
                expect(price).not.toBeNull()
                expect(price!.usdAmount).toBeGreaterThan(0)
                expect(price!.stripePriceId).toBeDefined()
                expect(price!.interval).toBe("yearly")
                expect(price!.label).toContain(tier.charAt(0).toUpperCase() + tier.slice(1))
                expect(price!.label).toContain("Yearly")
            }
        })

        it("returns monthly prices at a lower amount with the monthly price id", () => {
            for (const [product, tier] of combos) {
                const monthly = getCryptoPrice(product, tier, "monthly")
                const yearly = getCryptoPrice(product, tier, "yearly")
                expect(monthly).not.toBeNull()
                expect(yearly).not.toBeNull()
                expect(monthly!.usdAmount).toBeLessThan(yearly!.usdAmount)
                expect(monthly!.stripePriceId).not.toBe(yearly!.stripePriceId)
                expect(monthly!.interval).toBe("monthly")
                expect(monthly!.label).toContain("Monthly")
            }
        })
    })

    describe("getCryptoIntervalForStripePriceId", () => {
        it("resolves the interval encoded in a crypto plan price id", () => {
            const yearly = getCryptoPrice("bundle", "plus", "yearly")!
            const monthly = getCryptoPrice("bundle", "plus", "monthly")!

            expect(getCryptoIntervalForStripePriceId(yearly.stripePriceId)).toBe("yearly")
            expect(getCryptoIntervalForStripePriceId(monthly.stripePriceId)).toBe("monthly")
        })

        it("resolves monthly ids across every crypto product", () => {
            for (const product of ["bundle", "alias", "drop", "form"] as const) {
                const monthly = getCryptoPrice(product, "pro", "monthly")!
                expect(getCryptoIntervalForStripePriceId(monthly.stripePriceId)).toBe("monthly")
            }
        })

        it("returns null for unknown price ids", () => {
            expect(getCryptoIntervalForStripePriceId("price_unknown")).toBeNull()
            expect(getCryptoIntervalForStripePriceId("")).toBeNull()
        })
    })
})
