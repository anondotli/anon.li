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
