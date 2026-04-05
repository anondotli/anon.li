import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))

// Mock config/plans to isolate from module cache ordering across test files
vi.mock('@/config/plans', () => ({
    BUNDLE_PLANS: {
        plus: { name: 'Plus', price: { yearly: 39.49 }, priceIds: { yearly: 'price_bundle_plus_yearly' } },
        pro: { name: 'Pro', price: { yearly: 53.89 }, priceIds: { yearly: 'price_bundle_pro_yearly' } },
    },
    ALIAS_PLANS: {
        plus: { name: 'Plus', price: { yearly: 23.89 }, priceIds: { yearly: 'price_alias_plus_yearly' } },
        pro: { name: 'Pro', price: { yearly: 35.89 }, priceIds: { yearly: 'price_alias_pro_yearly' } },
    },
    DROP_PLANS: {
        plus: { name: 'Plus', price: { yearly: 29.89 }, priceIds: { yearly: 'price_drop_plus_yearly' } },
        pro: { name: 'Pro', price: { yearly: 45.49 }, priceIds: { yearly: 'price_drop_pro_yearly' } },
    },
}))

import { isValidCryptoProduct, isValidCryptoTier, getCryptoPrice } from '@/lib/crypto-prices'

describe('crypto-prices', () => {
    describe('isValidCryptoProduct', () => {
        it('should accept valid products', () => {
            expect(isValidCryptoProduct('bundle')).toBe(true)
            expect(isValidCryptoProduct('alias')).toBe(true)
            expect(isValidCryptoProduct('drop')).toBe(true)
        })

        it('should reject invalid products', () => {
            expect(isValidCryptoProduct('invalid')).toBe(false)
            expect(isValidCryptoProduct('')).toBe(false)
            expect(isValidCryptoProduct(null)).toBe(false)
            expect(isValidCryptoProduct(123)).toBe(false)
        })
    })

    describe('isValidCryptoTier', () => {
        it('should accept valid tiers', () => {
            expect(isValidCryptoTier('plus')).toBe(true)
            expect(isValidCryptoTier('pro')).toBe(true)
        })

        it('should reject invalid tiers', () => {
            expect(isValidCryptoTier('free')).toBe(false)
            expect(isValidCryptoTier('guest')).toBe(false)
            expect(isValidCryptoTier('')).toBe(false)
            expect(isValidCryptoTier(null)).toBe(false)
        })
    })

    describe('getCryptoPrice', () => {
        it('should return prices for all valid product/tier combinations', () => {
            const combos: Array<['bundle' | 'alias' | 'drop', 'plus' | 'pro']> = [
                ['bundle', 'plus'],
                ['bundle', 'pro'],
                ['alias', 'plus'],
                ['alias', 'pro'],
                ['drop', 'plus'],
                ['drop', 'pro'],
            ]

            for (const [product, tier] of combos) {
                const price = getCryptoPrice(product, tier)
                expect(price).not.toBeNull()
                expect(price!.usdAmount).toBeGreaterThan(0)
                expect(price!.stripePriceId).toBeDefined()
                expect(price!.label).toContain(tier.charAt(0).toUpperCase() + tier.slice(1))
            }
        })

        it('should return yearly prices only', () => {
            const price = getCryptoPrice('bundle', 'plus')
            expect(price).not.toBeNull()
            expect(price!.label).toContain('Yearly')
        })
    })
})
