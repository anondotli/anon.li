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

// Mock prisma — getUserSubscriptionPlan reads only prisma.subscription.findFirst
vi.mock('@/lib/prisma', () => ({
    prisma: {
        subscription: {
            findFirst: vi.fn(),
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

    it('should return free plan when no active subscription exists', async () => {
        const { prisma } = await import('@/lib/prisma')
        vi.mocked(prisma.subscription.findFirst).mockResolvedValue(null)

        const { getUserSubscriptionPlan } = await import('@/lib/subscription')
        const result = await getUserSubscriptionPlan({ id: 'user-1' })

        expect(result.tier).toBe('free')
        expect(result.product).toBe('bundle')
        expect(result.isPaid).toBe(false)
        expect(result.isCanceled).toBe(false)
    })

    it('should return free plan when active subscription is past its grace window', async () => {
        const expiredDate = new Date()
        expiredDate.setDate(expiredDate.getDate() - 10) // 10 days ago, well past 1-day grace

        const { prisma } = await import('@/lib/prisma')
        vi.mocked(prisma.subscription.findFirst).mockResolvedValue({
            id: 'sub-1',
            userId: 'user-1',
            provider: 'stripe',
            providerSubscriptionId: 'sub_123',
            providerCustomerId: 'cus_123',
            providerPriceId: MOCK_BUNDLE_PLUS_MONTHLY,
            product: 'bundle',
            tier: 'plus',
            status: 'active',
            currentPeriodStart: null,
            currentPeriodEnd: expiredDate,
            cancelAtPeriodEnd: false,
            createdAt: new Date(),
            updatedAt: new Date(),
        // biome-ignore lint/suspicious/noExplicitAny: test mock for Subscription model
        } as any)

        const { getUserSubscriptionPlan } = await import('@/lib/subscription')
        const result = await getUserSubscriptionPlan({ id: 'user-1' })

        expect(result.tier).toBe('free')
        expect(result.isPaid).toBe(false)
    })

    it('should return isCanceled true when cancelAtPeriodEnd is set on the active subscription', async () => {
        const futureDate = new Date()
        futureDate.setDate(futureDate.getDate() + 30)

        const { prisma } = await import('@/lib/prisma')
        vi.mocked(prisma.subscription.findFirst).mockResolvedValue({
            id: 'sub-1',
            userId: 'user-1',
            provider: 'stripe',
            providerSubscriptionId: 'sub_123',
            providerCustomerId: 'cus_123',
            providerPriceId: MOCK_BUNDLE_PLUS_MONTHLY,
            product: 'bundle',
            tier: 'plus',
            status: 'active',
            currentPeriodStart: null,
            currentPeriodEnd: futureDate,
            cancelAtPeriodEnd: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        // biome-ignore lint/suspicious/noExplicitAny: test mock for Subscription model
        } as any)

        const { getUserSubscriptionPlan } = await import('@/lib/subscription')
        const result = await getUserSubscriptionPlan({ id: 'user-1' })

        expect(result.isCanceled).toBe(true)
        expect(result.isPaid).toBe(true)
    })

    it('should return correct plan for an active bundle/plus subscription', async () => {
        const futureDate = new Date()
        futureDate.setDate(futureDate.getDate() + 30)

        const { prisma } = await import('@/lib/prisma')
        vi.mocked(prisma.subscription.findFirst).mockResolvedValue({
            id: 'sub-1',
            userId: 'user-1',
            provider: 'stripe',
            providerSubscriptionId: 'sub_123',
            providerCustomerId: 'cus_123',
            providerPriceId: MOCK_BUNDLE_PLUS_MONTHLY,
            product: 'bundle',
            tier: 'plus',
            status: 'active',
            currentPeriodStart: null,
            currentPeriodEnd: futureDate,
            cancelAtPeriodEnd: false,
            createdAt: new Date(),
            updatedAt: new Date(),
        // biome-ignore lint/suspicious/noExplicitAny: test mock for Subscription model
        } as any)

        const { getUserSubscriptionPlan } = await import('@/lib/subscription')
        const result = await getUserSubscriptionPlan({ id: 'user-1' })

        expect(result.product).toBe('bundle')
        expect(result.tier).toBe('plus')
        expect(result.isPaid).toBe(true)
        expect(result.isCanceled).toBe(false)
    })
})
