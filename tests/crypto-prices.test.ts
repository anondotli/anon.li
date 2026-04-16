import { describe, expect, it } from "vitest"

import { getCryptoPrice, isValidCryptoProduct, isValidCryptoTier } from "@/lib/crypto-prices"

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

    describe("getCryptoPrice", () => {
        it("returns prices for all valid product/tier combinations", () => {
            const combos: Array<["bundle" | "alias" | "drop", "plus" | "pro"]> = [
                ["bundle", "plus"],
                ["bundle", "pro"],
                ["alias", "plus"],
                ["alias", "pro"],
                ["drop", "plus"],
                ["drop", "pro"],
            ]

            for (const [product, tier] of combos) {
                const price = getCryptoPrice(product, tier)
                expect(price).not.toBeNull()
                expect(price!.usdAmount).toBeGreaterThan(0)
                expect(price!.stripePriceId).toBeDefined()
                expect(price!.label).toContain(tier.charAt(0).toUpperCase() + tier.slice(1))
            }
        })

        it("returns yearly prices only", () => {
            const price = getCryptoPrice("bundle", "plus")

            expect(price).not.toBeNull()
            expect(price!.label).toContain("Yearly")
        })
    })
})
