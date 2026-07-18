import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import { POST } from './route'

// Mock modules BEFORE imports that use them
vi.mock('@/lib/posthog.server', () => ({
    captureServerEvent: vi.fn(),
    flushPostHog: vi.fn(),
}))
vi.mock('next/server', async (importOriginal) => {
    const actual = await importOriginal<typeof import('next/server')>()
    return { ...actual, after: (fn: () => unknown) => { void fn() } }
})
vi.mock('@/lib/stripe', () => ({
    stripe: {
        webhooks: {
            constructEvent: vi.fn(),
        },
        subscriptions: {
            retrieve: vi.fn(),
        },
        customers: {
            retrieve: vi.fn(),
        },
    },
}))

vi.mock('@/lib/prisma', () => ({
    prisma: {
        user: {
            findUnique: vi.fn(),
            findMany: vi.fn().mockResolvedValue([]),
            update: vi.fn(),
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        drop: {
            updateMany: vi.fn(),
        },
        subscription: {
            upsert: vi.fn().mockResolvedValue({}),
            findUnique: vi.fn().mockResolvedValue({
                user: { id: 'user_123', email: 'test@example.com' },
            }),
            findFirst: vi.fn().mockResolvedValue(null),
        },
        alias: {
            count: vi.fn().mockResolvedValue(0),
            findMany: vi.fn().mockResolvedValue([]),
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        domain: {
            count: vi.fn().mockResolvedValue(0),
            findMany: vi.fn().mockResolvedValue([]),
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        recipient: {
            count: vi.fn().mockResolvedValue(0),
            findMany: vi.fn().mockResolvedValue([]),
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        organization: {
            update: vi.fn().mockResolvedValue({}),
        },
    },
}))


// Store original env
const originalEnv = process.env

// Create mock Redis instance — tryClaimEvent uses SET NX, markEventProcessed uses SET, releaseEventClaim uses DEL
const mockRedisSet = vi.fn().mockResolvedValue('OK') // SET NX returns 'OK' on success, null if already exists
const mockRedisDel = vi.fn().mockResolvedValue(1)

vi.mock('@upstash/redis', () => ({
    Redis: class MockRedis {
        set = mockRedisSet
        del = mockRedisDel
    },
}))

// Mock subscription-sync — the real upsertStripeSubscription depends on
// `getPlanFromPriceId` which is resolved at module load against env vars that
// aren't in scope for this test file. Mocking it lets us assert call shape
// directly while keeping the webhook's control flow intact.
const { mockUpsertStripeSubscription } = vi.hoisted(() => ({
    mockUpsertStripeSubscription: vi.fn().mockResolvedValue(true),
}))
vi.mock('@/lib/services/subscription-sync', () => ({
    upsertStripeSubscription: mockUpsertStripeSubscription,
}))

const { mockHandleOrgSubscriptionLoss } = vi.hoisted(() => ({
    mockHandleOrgSubscriptionLoss: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/services/org-billing', () => ({
    handleOrgSubscriptionLoss: mockHandleOrgSubscriptionLoss,
}))

const { mockGetOrgAdminEmails } = vi.hoisted(() => ({
    mockGetOrgAdminEmails: vi.fn().mockResolvedValue(['owner@example.com', 'admin@example.com']),
}))
vi.mock('@/lib/data/organization', () => ({
    getOrgAdminEmails: mockGetOrgAdminEmails,
}))

// Create mock functions for resend
const mockSendSubscriptionCanceledEmail = vi.fn().mockResolvedValue({ success: true })
const mockSendPaymentActionRequiredEmail = vi.fn().mockResolvedValue({ success: true })
const mockSendDowngradeWarningEmail = vi.fn().mockResolvedValue({ success: true })

vi.mock('@/lib/resend', () => ({
    getResendClient: vi.fn(),
    sendWelcomeEmail: vi.fn().mockResolvedValue({ success: true }),
    sendSubscriptionCanceledEmail: mockSendSubscriptionCanceledEmail,
    sendPaymentActionRequiredEmail: mockSendPaymentActionRequiredEmail,
    sendFileExpiringEmail: vi.fn().mockResolvedValue({ success: true }),
    sendDropExpiringEmail: vi.fn().mockResolvedValue({ success: true }),
    sendDownloadLimitReachedEmail: vi.fn().mockResolvedValue({ success: true }),
    sendDomainDeletedEmail: vi.fn().mockResolvedValue({ success: true }),
    sendDomainUnverifiedEmail: vi.fn().mockResolvedValue({ success: true }),
    sendMagicLinkEmail: vi.fn().mockResolvedValue({ success: true }),
    sendEmail: vi.fn().mockResolvedValue({ success: true }),
    sendRecipientVerificationEmail: vi.fn().mockResolvedValue({ success: true }),
    sendDowngradeWarningEmail: mockSendDowngradeWarningEmail,
    sendResourcesScheduledForRemovalEmail: vi.fn().mockResolvedValue({ success: true }),
    sendResourcesDeletedEmail: vi.fn().mockResolvedValue({ success: true }),
    sendCryptoPaymentConfirmationEmail: vi.fn().mockResolvedValue({ success: true }),
    sendCryptoRenewalReminderEmail: vi.fn().mockResolvedValue({ success: true }),
}))

// Mock BillingDowngradeService to isolate webhook tests
const mockRecordDowngrade = vi.fn().mockResolvedValue(undefined)
const mockCancelDowngrade = vi.fn().mockResolvedValue(undefined)
const mockCalculateExcess = vi.fn().mockResolvedValue({
    excessRandom: 0,
    excessCustom: 0,
    excessDomains: 0,
    excessRecipients: 0,
})

vi.mock('@/lib/services/billing-downgrade', () => ({
    BillingDowngradeService: {
        recordDowngrade: mockRecordDowngrade,
        cancelDowngrade: mockCancelDowngrade,
        calculateExcess: mockCalculateExcess,
    },
}))

vi.mock('next/headers', () => ({
    headers: vi.fn().mockResolvedValue({
        get: vi.fn().mockReturnValue('test-signature'),
    }),
}))

// Type-safe mock references
const mockConstructEvent = stripe.webhooks.constructEvent as Mock
const mockSubscriptionsRetrieve = stripe.subscriptions.retrieve as Mock
const mockUserFindUnique = prisma.user.findUnique as Mock
const mockUserUpdate = prisma.user.update as Mock
const mockDropUpdateMany = prisma.drop.updateMany as Mock
const mockSubscriptionFindUnique = prisma.subscription.findUnique as Mock

describe('Stripe Webhook Handler', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        // Reset Redis mock — SET NX returns 'OK' (claim succeeded)
        mockRedisSet.mockReset()
        mockRedisSet.mockResolvedValue('OK')
        mockRedisDel.mockReset()
        mockRedisDel.mockResolvedValue(1)
        mockSubscriptionFindUnique.mockResolvedValue({
            userId: 'user_123',
            organizationId: null,
            user: { id: 'user_123', email: 'test@example.com' },
        })
        process.env = {
            ...originalEnv,
            STRIPE_SECRET_KEY: 'sk_test_123',
            STRIPE_WEBHOOK_SECRET: 'whsec_test_123',
            UPSTASH_REDIS_REST_URL: 'https://test.upstash.io',
            UPSTASH_REDIS_REST_TOKEN: 'test_token',
            // Map the synthetic 'price_123' used in test fixtures to a known plan so
            // upsertStripeSubscription doesn't bail out with "unknown price ID".
            STRIPE_BUNDLE_PLUS_MONTHLY_PRICE_ID: 'price_123',
        }
    })

    afterEach(() => {
        process.env = originalEnv
    })

    describe('Signature Verification', () => {
        it('should return 400 for invalid signature', async () => {
            mockConstructEvent.mockImplementation(() => {
                throw new Error('Invalid signature')
            })

            const request = new Request('http://localhost/api/webhooks/stripe', {
                method: 'POST',
                body: JSON.stringify({}),
            })

            const response = await POST(request)
            expect(response.status).toBe(400)
        })

        it('should not leak error details in response body', async () => {
            mockConstructEvent.mockImplementation(() => {
                throw new Error('Detailed internal error: key xyz expired')
            })

            const request = new Request('http://localhost/api/webhooks/stripe', {
                method: 'POST',
                body: JSON.stringify({}),
            })

            const response = await POST(request)
            const body = await response.text()
            expect(body).toBe('Webhook signature verification failed')
            expect(body).not.toContain('Detailed internal error')
        })
    })

    describe('Idempotency', () => {
        it('should skip already processed events', async () => {
            // SET NX returns null when key already exists (event already claimed/processed)
            mockRedisSet.mockResolvedValueOnce(null)

            mockConstructEvent.mockReturnValue({
                id: 'evt_duplicate',
                type: 'checkout.session.completed',
                data: { object: {} },
            } as never)

            const request = new Request('http://localhost/api/webhooks/stripe', {
                method: 'POST',
                body: JSON.stringify({}),
            })

            const response = await POST(request)
            expect(response.status).toBe(200)
            // Verify no handler was invoked (no subscription retrieve, no user update)
            expect(mockSubscriptionsRetrieve).not.toHaveBeenCalled()
            expect(mockUserUpdate).not.toHaveBeenCalled()
        })
    })

    describe('Error Handling', () => {
        it('should return 500 on transient errors so Stripe retries', async () => {
            mockConstructEvent.mockReturnValue({
                id: 'evt_handler_error',
                type: 'invoice.payment_succeeded',
                data: {
                    object: {
                        id: 'in_123',
                        subscription: 'sub_123',
                    },
                },
            } as never)

            // Force handler to throw a transient error
            mockSubscriptionsRetrieve.mockRejectedValue(new Error('Stripe API down'))

            const request = new Request('http://localhost/api/webhooks/stripe', {
                method: 'POST',
                body: JSON.stringify({}),
            })

            const response = await POST(request)
            expect(response.status).toBe(500)
        })

        it('releases an unknown-price event so it succeeds after configuration is restored', async () => {
            mockConstructEvent.mockReturnValue({
                id: 'evt_unknown_price',
                type: 'checkout.session.completed',
                data: {
                    object: {
                        id: 'cs_unknown_price',
                        metadata: { userId: 'user_123' },
                        customer: 'cus_123',
                        subscription: 'sub_unknown_price',
                    },
                },
            } as never)
            mockSubscriptionsRetrieve.mockResolvedValue({
                id: 'sub_unknown_price',
                customer: 'cus_123',
                items: { data: [{ price: { id: 'price_not_configured' } }] },
            } as never)
            mockUpsertStripeSubscription
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(true)

            const makeRequest = () => new Request('http://localhost/api/webhooks/stripe', {
                method: 'POST',
                body: JSON.stringify({}),
            })

            const firstResponse = await POST(makeRequest())
            expect(firstResponse.status).toBe(500)
            expect(mockRedisDel).toHaveBeenCalledWith('stripe:event:evt_unknown_price')
            expect(mockCancelDowngrade).not.toHaveBeenCalled()

            const retryResponse = await POST(makeRequest())
            expect(retryResponse.status).toBe(200)
            expect(mockUpsertStripeSubscription).toHaveBeenCalledTimes(2)
            expect(mockCancelDowngrade).toHaveBeenCalledWith('user_123')
        })

        it('retries when a subscription event arrives before its canonical row exists', async () => {
            const subscription = {
                id: 'sub_not_linked_yet',
                status: 'active',
                items: { data: [{ price: { id: 'price_123' } }] },
            }
            mockConstructEvent.mockReturnValue({
                id: 'evt_not_linked_yet',
                type: 'customer.subscription.updated',
                data: { object: subscription },
            } as never)
            mockSubscriptionFindUnique.mockResolvedValueOnce(null)

            const response = await POST(new Request('http://localhost/api/webhooks/stripe', {
                method: 'POST',
                body: JSON.stringify({}),
            }))

            expect(response.status).toBe(500)
            expect(mockRedisDel).toHaveBeenCalledWith('stripe:event:evt_not_linked_yet')
            expect(mockUpsertStripeSubscription).not.toHaveBeenCalled()
        })
    })

    describe('Event Handling', () => {
        it('should handle checkout.session.completed', async () => {
            const mockSession = {
                id: 'cs_123',
                metadata: { userId: 'user_123' },
                customer: 'cus_123',
                subscription: 'sub_123',
            }

            const mockSubscription = {
                id: 'sub_123',
                customer: 'cus_123',
                current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
                cancel_at_period_end: false,
                items: {
                    data: [{ price: { id: 'price_123' } }],
                },
            }

            mockConstructEvent.mockReturnValue({
                id: 'evt_123',
                type: 'checkout.session.completed',
                data: { object: mockSession },
            } as never)

            mockSubscriptionsRetrieve.mockResolvedValue(mockSubscription as never)
            mockUserUpdate.mockResolvedValue({} as never)

            const request = new Request('http://localhost/api/webhooks/stripe', {
                method: 'POST',
                body: JSON.stringify({}),
            })

            const response = await POST(request)
            expect(response.status).toBe(200)
        })

        it('should handle customer.subscription.updated and track cancellation', async () => {
            const mockSubscription = {
                id: 'sub_123',
                status: 'active',
                current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
                cancel_at_period_end: true, // User scheduled cancellation
                items: {
                    data: [{ price: { id: 'price_123' } }],
                },
            }

            mockConstructEvent.mockReturnValue({
                id: 'evt_unique_update', // Unique ID to avoid Redis collision
                type: 'customer.subscription.updated',
                data: { object: mockSubscription },
            } as never)

            mockUserUpdate.mockResolvedValue({} as never)

            const request = new Request('http://localhost/api/webhooks/stripe', {
                method: 'POST',
                body: JSON.stringify({}),
            })

            const response = await POST(request)
            expect(response.status).toBe(200)

            // Verify that cancelAtPeriodEnd is tracked on the canonical Subscription row
            expect(mockUpsertStripeSubscription).toHaveBeenCalledWith(
                'user_123',
                expect.objectContaining({
                    id: 'sub_123',
                    cancel_at_period_end: true,
                }),
            )
        })

        it('should handle customer.subscription.deleted', async () => {
            const mockSubscription = {
                id: 'sub_123',
                status: 'canceled',
                customer: 'cus_123',
                current_period_end: Math.floor(Date.now() / 1000),
                cancel_at_period_end: false,
                items: {
                    data: [{
                        price: { id: 'price_123' },
                        current_period_start: Math.floor(Date.now() / 1000) - 86400 * 30,
                        current_period_end: Math.floor(Date.now() / 1000),
                    }],
                },
            }

            mockConstructEvent.mockReturnValue({
                id: 'evt_789',
                type: 'customer.subscription.deleted',
                data: { object: mockSubscription },
            } as never)

            mockUserFindUnique.mockResolvedValue({
                id: 'user_123',
                email: 'test@example.com',
            } as never)
            mockUserUpdate.mockResolvedValue({} as never)
            mockDropUpdateMany.mockResolvedValue({ count: 0 })

            const request = new Request('http://localhost/api/webhooks/stripe', {
                method: 'POST',
                body: JSON.stringify({}),
            })

            const response = await POST(request)
            expect(response.status).toBe(200)
        })

        describe('organization subscription with a deleted buyer', () => {
            const canonicalOrgOwner = {
                userId: null,
                organizationId: 'org_123',
                user: null,
            }

            function makeOrgSubscription(status: string) {
                return {
                    id: 'sub_orphaned_org',
                    status,
                    customer: 'cus_org_123',
                    metadata: {}, // canonical org link must survive missing Stripe metadata
                    current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
                    cancel_at_period_end: false,
                    items: {
                        data: [{
                            price: { id: 'price_123' },
                            quantity: 7,
                        }],
                    },
                }
            }

            async function postEvent(type: string, object: unknown, id: string) {
                mockConstructEvent.mockReturnValue({
                    id,
                    type,
                    data: { object },
                } as never)

                return POST(new Request('http://localhost/api/webhooks/stripe', {
                    method: 'POST',
                    body: JSON.stringify({}),
                }))
            }

            it('syncs status and seats on customer.subscription.updated', async () => {
                const subscription = makeOrgSubscription('active')
                mockSubscriptionFindUnique.mockResolvedValue(canonicalOrgOwner)

                const response = await postEvent(
                    'customer.subscription.updated',
                    subscription,
                    'evt_orphaned_org_updated',
                )

                expect(response.status).toBe(200)
                expect(mockUpsertStripeSubscription).toHaveBeenCalledWith(
                    null,
                    expect.objectContaining({
                        id: 'sub_orphaned_org',
                        status: 'active',
                        items: { data: [expect.objectContaining({ quantity: 7 })] },
                    }),
                )
                expect(mockHandleOrgSubscriptionLoss).not.toHaveBeenCalled()
            })

            it('syncs payment failure and applies the org downgrade flow', async () => {
                const subscription = makeOrgSubscription('past_due')
                mockSubscriptionFindUnique.mockResolvedValue(canonicalOrgOwner)
                mockSubscriptionsRetrieve.mockResolvedValue(subscription as never)

                const response = await postEvent(
                    'invoice.payment_failed',
                    { id: 'in_orphaned_org', subscription: subscription.id },
                    'evt_orphaned_org_payment_failed',
                )

                expect(response.status).toBe(200)
                expect(mockUpsertStripeSubscription).toHaveBeenCalledWith(null, subscription)
                expect(mockHandleOrgSubscriptionLoss).toHaveBeenCalledWith('org_123', expect.any(Date))
                expect(mockRecordDowngrade).not.toHaveBeenCalled()
                expect(mockSendSubscriptionCanceledEmail).not.toHaveBeenCalled()
            })

            it('syncs deletion and applies the org downgrade flow', async () => {
                const subscription = makeOrgSubscription('canceled')
                mockSubscriptionFindUnique.mockResolvedValue(canonicalOrgOwner)

                const response = await postEvent(
                    'customer.subscription.deleted',
                    subscription,
                    'evt_orphaned_org_deleted',
                )

                expect(response.status).toBe(200)
                expect(mockUpsertStripeSubscription).toHaveBeenCalledWith(null, subscription)
                expect(mockHandleOrgSubscriptionLoss).toHaveBeenCalledWith('org_123', expect.any(Date))
                expect(mockDropUpdateMany).not.toHaveBeenCalled()
            })

            it('syncs a resumed org subscription without requiring a personal actor', async () => {
                const subscription = makeOrgSubscription('active')
                mockSubscriptionFindUnique.mockResolvedValue(canonicalOrgOwner)

                const response = await postEvent(
                    'customer.subscription.resumed',
                    subscription,
                    'evt_orphaned_org_resumed',
                )

                expect(response.status).toBe(200)
                expect(mockUpsertStripeSubscription).toHaveBeenCalledWith(null, subscription)
                expect(mockCancelDowngrade).not.toHaveBeenCalled()
            })

            it('notifies current org admins when payment action is required', async () => {
                mockSubscriptionFindUnique.mockResolvedValue(canonicalOrgOwner)

                const response = await postEvent(
                    'invoice.payment_action_required',
                    {
                        id: 'in_orphaned_org_action',
                        subscription: 'sub_orphaned_org',
                        hosted_invoice_url: 'https://stripe.example/invoice',
                    },
                    'evt_orphaned_org_action_required',
                )

                expect(response.status).toBe(200)
                expect(mockGetOrgAdminEmails).toHaveBeenCalledWith('org_123')
                expect(mockSendPaymentActionRequiredEmail).toHaveBeenCalledTimes(2)
                expect(mockSendPaymentActionRequiredEmail).toHaveBeenCalledWith(
                    'owner@example.com',
                    'https://stripe.example/invoice',
                )
                expect(mockSendPaymentActionRequiredEmail).toHaveBeenCalledWith(
                    'admin@example.com',
                    'https://stripe.example/invoice',
                )
            })
        })
    })
})
