import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock environment variables for Stripe price IDs
const MOCK_BUNDLE_PLUS_MONTHLY = 'price_bundle_plus_monthly'

// Store original env
const originalEnv = process.env

// Mock the stripe module
vi.mock('@/lib/stripe', () => ({
    stripe: {
        subscriptions: {
            retrieve: vi.fn(),
        },
    },
}))

// Mock prisma
vi.mock('@/lib/prisma', () => ({
    prisma: {
        user: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
        subscription: {
            findFirst: vi.fn().mockResolvedValue(null),
            findMany: vi.fn().mockResolvedValue([]),
        },
    },
}))

// Mock config/plans — must include ALL exports that any transitive dependency needs.
// subscription.ts imports from @/config/plans, and when tests run in the same bun process,
// this mock may be used for limits.ts too (which imports ALIAS_LIMITS, STORAGE_LIMITS, etc.)
vi.mock('@/config/plans', () => {
    const freePlan = {
        id: 'bundle_free',
        name: 'Free',
        description: 'Free plan',
        price: { monthly: 0, yearly: 0 },
        features: [],
    }
    const plusPlan = {
        id: 'bundle_plus',
        name: 'Plus',
        description: 'Plus plan',
        price: { monthly: 4.99, yearly: 47.89 },
        priceIds: { monthly: 'price_bundle_plus_monthly', yearly: 'price_bundle_plus_yearly' },
        features: [],
    }
    return {
        BUNDLE_PLANS: { free: freePlan, plus: plusPlan, pro: plusPlan },
        ALIAS_PLANS: { free: freePlan, plus: plusPlan, pro: plusPlan },
        DROP_PLANS: { free: freePlan, plus: plusPlan, pro: plusPlan },
        ALIAS_LIMITS: {
            free: { random: 10, custom: 1, domains: 0, recipients: 1, apiRequests: 500 },
            plus: { random: 50, custom: 10, domains: 3, recipients: 5, apiRequests: 10000 },
            pro: { random: 250, custom: 100, domains: 10, recipients: 10, apiRequests: 100000 },
        },
        STORAGE_LIMITS: { guest: 3221225472, free: 5368709120, plus: 53687091200, pro: 268435456000 },
        DROP_SIZE_LIMITS: { guest: 3221225472, free: 5368709120, plus: 53687091200, pro: 268435456000 },
        EXPIRY_LIMITS: { free: 7, plus: 30, pro: 365 },
        DROP_FEATURES: {
            free: { downloadLimits: false },
            plus: { downloadLimits: true },
            pro: { downloadLimits: true },
        },
        getPlanFromPriceId: (priceId: string) => {
            if (priceId === 'price_bundle_plus_monthly') return { product: 'bundle', tier: 'plus' }
            return null
        },
    }
})

describe('getUserSubscriptionPlan', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        process.env = {
            ...originalEnv,
            STRIPE_BUNDLE_PLUS_MONTHLY_PRICE_ID: MOCK_BUNDLE_PLUS_MONTHLY,
            STRIPE_SECRET_KEY: 'sk_test_123',
            STRIPE_WEBHOOK_SECRET: 'whsec_test_123',
        }
    })

    afterEach(() => {
        process.env = originalEnv
    })

    const baseUser = {
        id: 'user-1',
        name: 'Test User',
        email: 'test@example.com',
        emailVerified: false,
        image: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        stripePriceId: null,
        stripeCurrentPeriodEnd: null,
        stripeCancelAtPeriodEnd: false,
        storageUsed: BigInt(0),
        storageLimit: BigInt(5368709120),
        createdAt: new Date(),
        updatedAt: new Date(),
        isAdmin: false,
        banned: false,
        banAliasCreation: false,
        banFileUpload: false,
        banReason: null,
        tosViolations: 0,
        downgradedAt: null,
        paymentMethod: 'stripe',
        twoFactorEnabled: false,
    }

    it('should return free plan for user without subscription', async () => {
        const { getUserSubscriptionPlan } = await import('@/lib/subscription')

        const user = { ...baseUser }

        const result = await getUserSubscriptionPlan(user)

        expect(result.tier).toBe('free')
        expect(result.product).toBe('bundle')
        expect(result.isPaid).toBe(false)
        expect(result.isCanceled).toBe(false)
    })

    it('should return free plan for expired subscription', async () => {
        const { getUserSubscriptionPlan } = await import('@/lib/subscription')

        const expiredDate = new Date()
        expiredDate.setDate(expiredDate.getDate() - 10) // 10 days ago

        const user = {
            ...baseUser,
            stripeCustomerId: 'cus_123',
            stripeSubscriptionId: 'sub_123',
            stripePriceId: MOCK_BUNDLE_PLUS_MONTHLY,
            stripeCurrentPeriodEnd: expiredDate,
        }

        const result = await getUserSubscriptionPlan(user)

        expect(result.tier).toBe('free')
        expect(result.isPaid).toBe(false)
    })

    it('should return isCanceled true when stripeCancelAtPeriodEnd is true', async () => {
        const { getUserSubscriptionPlan } = await import('@/lib/subscription')

        const futureDate = new Date()
        futureDate.setDate(futureDate.getDate() + 30)

        const user = {
            ...baseUser,
            stripeCustomerId: 'cus_123',
            stripeSubscriptionId: 'sub_123',
            stripePriceId: MOCK_BUNDLE_PLUS_MONTHLY,
            stripeCurrentPeriodEnd: futureDate,
            stripeCancelAtPeriodEnd: true,
        }

        const result = await getUserSubscriptionPlan(user)

        expect(result.isCanceled).toBe(true)
        expect(result.isPaid).toBe(true)
    })

    it('should return correct plan for bundle plus subscription', async () => {
        const { getUserSubscriptionPlan } = await import('@/lib/subscription')

        const futureDate = new Date()
        futureDate.setDate(futureDate.getDate() + 30)

        const user = {
            ...baseUser,
            stripeCustomerId: 'cus_123',
            stripeSubscriptionId: 'sub_123',
            stripePriceId: MOCK_BUNDLE_PLUS_MONTHLY,
            stripeCurrentPeriodEnd: futureDate,
        }

        const result = await getUserSubscriptionPlan(user)

        expect(result.product).toBe('bundle')
        expect(result.tier).toBe('plus')
        expect(result.isPaid).toBe(true)
        expect(result.isCanceled).toBe(false)
    })
})
