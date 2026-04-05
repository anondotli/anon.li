import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock @/lib/constants
vi.mock('@/lib/constants', () => ({
    DAY_MS: 86_400_000,
}))

// Mock @/config/plans module — all values must be inlined since vi.mock is hoisted
vi.mock('@/config/plans', () => {
    const ALIAS_PLANS = {
        plus: { priceIds: { monthly: 'price_alias_plus_monthly', yearly: 'price_alias_plus_yearly' } },
        pro: { priceIds: { monthly: 'price_alias_pro_monthly', yearly: 'price_alias_pro_yearly' } },
    }
    const BUNDLE_PLANS = {
        plus: { priceIds: { monthly: 'price_bundle_plus_monthly', yearly: 'price_bundle_plus_yearly' } },
        pro: { priceIds: { monthly: 'price_bundle_pro_monthly', yearly: 'price_bundle_pro_yearly' } },
    }
    const DROP_PLANS = {
        plus: { priceIds: { monthly: 'price_drop_plus_monthly', yearly: 'price_drop_plus_yearly' } },
        pro: { priceIds: { monthly: 'price_drop_pro_monthly', yearly: 'price_drop_pro_yearly' } },
    }

    function getPlanFromPriceId(priceId: string) {
        for (const [product, plans] of [['bundle', BUNDLE_PLANS], ['alias', ALIAS_PLANS], ['drop', DROP_PLANS]] as const) {
            for (const [tier, plan] of Object.entries(plans) as [string, { priceIds: { monthly: string; yearly: string } }][]) {
                if (priceId === plan.priceIds.monthly || priceId === plan.priceIds.yearly) {
                    return { product, tier }
                }
            }
        }
        return null
    }

    return {
        DROP_SIZE_LIMITS: {
            guest: 3221225472,
            free: 5368709120,
            plus: 53687091200,
            pro: 268435456000,
        },
        ALIAS_LIMITS: {
            free: { random: 10, custom: 1, domains: 0, recipients: 1, apiRequests: 500 },
            plus: { random: 50, custom: 10, domains: 3, recipients: 5, apiRequests: 10000 },
            pro: { random: 250, custom: 100, domains: 10, recipients: 10, apiRequests: 100000 },
        },
        STORAGE_LIMITS: {
            guest: 3221225472,
            free: 5368709120,
            plus: 53687091200,
            pro: 268435456000,
        },
        EXPIRY_LIMITS: {
            free: 7,
            plus: 30,
            pro: 365,
        },
        DROP_FEATURES: {
            free: { downloadLimits: false },
            plus: { downloadLimits: true },
            pro: { downloadLimits: true },
        },
        ALIAS_PLANS,
        BUNDLE_PLANS,
        DROP_PLANS,
        getPlanFromPriceId,
    }
})

// Constants for test assertions (must match values in vi.mock factory above)
const MOCK_BUNDLE_PLUS_MONTHLY = 'price_bundle_plus_monthly'
const MOCK_BUNDLE_PRO_MONTHLY = 'price_bundle_pro_monthly'
const MOCK_ALIAS_PLUS_MONTHLY = 'price_alias_plus_monthly'
const MOCK_ALIAS_PRO_MONTHLY = 'price_alias_pro_monthly'
const MOCK_DROP_PLUS_MONTHLY = 'price_drop_plus_monthly'
const MOCK_DROP_PRO_MONTHLY = 'price_drop_pro_monthly'

const MOCK_ALIAS_LIMITS = {
    free: { random: 10, custom: 1, domains: 0, recipients: 1, apiRequests: 500 },
    plus: { random: 50, custom: 10, domains: 3, recipients: 5, apiRequests: 10000 },
    pro: { random: 250, custom: 100, domains: 10, recipients: 10, apiRequests: 100000 },
}

const MOCK_STORAGE_LIMITS = {
    free: 5368709120,
    plus: 53687091200,
    pro: 268435456000,
}

const MOCK_EXPIRY_LIMITS = {
    free: 7,
    plus: 30,
    pro: 365,
}

import { getPlanLimits, getDropLimits, getEffectiveTier, getRecipientLimit, getProductFromPriceId } from '@/lib/limits'

const originalEnv = process.env

describe('getPlanLimits', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        process.env = { ...originalEnv }
    })

    afterEach(() => {
        process.env = originalEnv
    })

    it('should return free limits for undefined user', () => {
        const result = getPlanLimits(undefined)
        expect(result).toEqual(MOCK_ALIAS_LIMITS.free)
    })

    it('should return free limits for user without subscription', () => {
        const user = { stripePriceId: null, stripeCurrentPeriodEnd: null }
        const result = getPlanLimits(user)
        expect(result).toEqual(MOCK_ALIAS_LIMITS.free)
    })

    it('should return free limits for expired subscription', () => {
        const expiredDate = new Date()
        expiredDate.setDate(expiredDate.getDate() - 10)

        const user = {
            stripePriceId: MOCK_BUNDLE_PLUS_MONTHLY,
            stripeCurrentPeriodEnd: expiredDate,
        }
        const result = getPlanLimits(user)
        expect(result).toEqual(MOCK_ALIAS_LIMITS.free)
    })

    it('should return plus limits for bundle plus subscription', () => {
        const futureDate = new Date()
        futureDate.setDate(futureDate.getDate() + 30)

        const user = {
            stripePriceId: MOCK_BUNDLE_PLUS_MONTHLY,
            stripeCurrentPeriodEnd: futureDate,
        }
        const result = getPlanLimits(user)
        expect(result).toEqual(MOCK_ALIAS_LIMITS.plus)
    })

    it('should return pro limits for bundle pro subscription', () => {
        const futureDate = new Date()
        futureDate.setDate(futureDate.getDate() + 30)

        const user = {
            stripePriceId: MOCK_BUNDLE_PRO_MONTHLY,
            stripeCurrentPeriodEnd: futureDate,
        }
        const result = getPlanLimits(user)
        expect(result).toEqual(MOCK_ALIAS_LIMITS.pro)
    })

    it('should return free alias limits for drop-only subscription', () => {
        const futureDate = new Date()
        futureDate.setDate(futureDate.getDate() + 30)

        const user = {
            stripePriceId: MOCK_DROP_PLUS_MONTHLY,
            stripeCurrentPeriodEnd: futureDate,
        }
        const result = getPlanLimits(user)
        expect(result).toEqual(MOCK_ALIAS_LIMITS.free)
    })
})

describe('getDropLimits', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should return free limits for undefined user', () => {
        const result = getDropLimits(undefined)
        expect(result.maxStorage).toBe(MOCK_STORAGE_LIMITS.free)
        expect(result.maxExpiry).toBe(MOCK_EXPIRY_LIMITS.free)
    })

    it('should return plus limits for drop plus subscription', () => {
        const futureDate = new Date()
        futureDate.setDate(futureDate.getDate() + 30)

        const user = {
            stripePriceId: MOCK_DROP_PLUS_MONTHLY,
            stripeCurrentPeriodEnd: futureDate,
        }
        const result = getDropLimits(user)
        expect(result.maxStorage).toBe(MOCK_STORAGE_LIMITS.plus)
        expect(result.maxExpiry).toBe(MOCK_EXPIRY_LIMITS.plus)
    })

    it('should return pro limits for bundle pro subscription', () => {
        const futureDate = new Date()
        futureDate.setDate(futureDate.getDate() + 30)

        const user = {
            stripePriceId: MOCK_BUNDLE_PRO_MONTHLY,
            stripeCurrentPeriodEnd: futureDate,
        }
        const result = getDropLimits(user)
        expect(result.maxStorage).toBe(MOCK_STORAGE_LIMITS.pro)
        expect(result.maxExpiry).toBe(MOCK_EXPIRY_LIMITS.pro)
    })

    it('should return free drop limits for alias-only subscription', () => {
        const futureDate = new Date()
        futureDate.setDate(futureDate.getDate() + 30)

        const user = {
            stripePriceId: MOCK_ALIAS_PLUS_MONTHLY,
            stripeCurrentPeriodEnd: futureDate,
        }
        const result = getDropLimits(user)
        expect(result.maxStorage).toBe(MOCK_STORAGE_LIMITS.free)
        expect(result.maxExpiry).toBe(MOCK_EXPIRY_LIMITS.free)
    })
})

describe('getEffectiveTier', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should return free for undefined user', () => {
        expect(getEffectiveTier(undefined)).toBe('free')
    })

    it('should return free for user without subscription', () => {
        expect(getEffectiveTier({ stripePriceId: null })).toBe('free')
    })

    it('should return plus for plus subscription', () => {
        const futureDate = new Date()
        futureDate.setDate(futureDate.getDate() + 30)

        expect(getEffectiveTier({ stripePriceId: MOCK_BUNDLE_PLUS_MONTHLY, stripeCurrentPeriodEnd: futureDate })).toBe('plus')
        expect(getEffectiveTier({ stripePriceId: MOCK_ALIAS_PLUS_MONTHLY, stripeCurrentPeriodEnd: futureDate })).toBe('plus')
        expect(getEffectiveTier({ stripePriceId: MOCK_DROP_PLUS_MONTHLY, stripeCurrentPeriodEnd: futureDate })).toBe('plus')
    })

    it('should return pro for pro subscription', () => {
        const futureDate = new Date()
        futureDate.setDate(futureDate.getDate() + 30)

        expect(getEffectiveTier({ stripePriceId: MOCK_BUNDLE_PRO_MONTHLY, stripeCurrentPeriodEnd: futureDate })).toBe('pro')
        expect(getEffectiveTier({ stripePriceId: MOCK_ALIAS_PRO_MONTHLY, stripeCurrentPeriodEnd: futureDate })).toBe('pro')
        expect(getEffectiveTier({ stripePriceId: MOCK_DROP_PRO_MONTHLY, stripeCurrentPeriodEnd: futureDate })).toBe('pro')
    })

    it('should return free for expired subscription', () => {
        const expiredDate = new Date()
        expiredDate.setDate(expiredDate.getDate() - 10)

        expect(getEffectiveTier({
            stripePriceId: MOCK_BUNDLE_PRO_MONTHLY,
            stripeCurrentPeriodEnd: expiredDate,
        })).toBe('free')
    })

    it('should return correct tier for active subscription', () => {
        const futureDate = new Date()
        futureDate.setDate(futureDate.getDate() + 30)

        expect(getEffectiveTier({
            stripePriceId: MOCK_BUNDLE_PRO_MONTHLY,
            stripeCurrentPeriodEnd: futureDate,
        })).toBe('pro')

        expect(getEffectiveTier({
            stripePriceId: MOCK_DROP_PLUS_MONTHLY,
            stripeCurrentPeriodEnd: futureDate,
        })).toBe('plus')
    })

    it('should return paid tier within 1-day grace period', () => {
        // Expired 12 hours ago — within 1-day grace period
        const recentlyExpired = new Date()
        recentlyExpired.setHours(recentlyExpired.getHours() - 12)

        expect(getEffectiveTier({
            stripePriceId: MOCK_BUNDLE_PRO_MONTHLY,
            stripeCurrentPeriodEnd: recentlyExpired,
        })).toBe('pro')
    })

    it('should return free when stripeCurrentPeriodEnd is omitted (prevents null period exploit)', () => {
        expect(getEffectiveTier({ stripePriceId: MOCK_BUNDLE_PRO_MONTHLY })).toBe('free')
        expect(getEffectiveTier({ stripePriceId: MOCK_DROP_PLUS_MONTHLY })).toBe('free')
    })
})

describe('getProductFromPriceId', () => {
    it('should return null for null/undefined', () => {
        expect(getProductFromPriceId(null)).toBeNull()
        expect(getProductFromPriceId(undefined)).toBeNull()
    })

    it('should return bundle for bundle price IDs', () => {
        expect(getProductFromPriceId(MOCK_BUNDLE_PLUS_MONTHLY)).toBe('bundle')
        expect(getProductFromPriceId(MOCK_BUNDLE_PRO_MONTHLY)).toBe('bundle')
    })

    it('should return alias for alias price IDs', () => {
        expect(getProductFromPriceId(MOCK_ALIAS_PLUS_MONTHLY)).toBe('alias')
        expect(getProductFromPriceId(MOCK_ALIAS_PRO_MONTHLY)).toBe('alias')
    })

    it('should return drop for drop price IDs', () => {
        expect(getProductFromPriceId(MOCK_DROP_PLUS_MONTHLY)).toBe('drop')
        expect(getProductFromPriceId(MOCK_DROP_PRO_MONTHLY)).toBe('drop')
    })

    it('should return null for unknown price ID', () => {
        expect(getProductFromPriceId('price_unknown')).toBeNull()
    })
})

describe('getRecipientLimit', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should return free recipient limit for undefined user', () => {
        expect(getRecipientLimit(undefined)).toBe(MOCK_ALIAS_LIMITS.free.recipients)
    })

    it('should return plus recipient limit for bundle plus', () => {
        const futureDate = new Date()
        futureDate.setDate(futureDate.getDate() + 30)

        const user = {
            stripePriceId: MOCK_BUNDLE_PLUS_MONTHLY,
            stripeCurrentPeriodEnd: futureDate,
        }
        expect(getRecipientLimit(user)).toBe(MOCK_ALIAS_LIMITS.plus.recipients)
    })

    it('should return pro recipient limit for alias pro', () => {
        const futureDate = new Date()
        futureDate.setDate(futureDate.getDate() + 30)

        const user = {
            stripePriceId: MOCK_ALIAS_PRO_MONTHLY,
            stripeCurrentPeriodEnd: futureDate,
        }
        expect(getRecipientLimit(user)).toBe(MOCK_ALIAS_LIMITS.pro.recipients)
    })
})
