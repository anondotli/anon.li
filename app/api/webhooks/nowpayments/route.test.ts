import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import crypto from 'crypto'
import type { CryptoPayment } from '@prisma/client'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/posthog.server', () => ({
    captureServerEvent: vi.fn(),
    trackServerEvent: vi.fn(),
    flushPostHog: vi.fn(),
}))
vi.mock('next/server', async (importOriginal) => {
    const actual = await importOriginal<typeof import('next/server')>()
    return { ...actual, after: (fn: () => unknown) => { void fn() } }
})

vi.mock('@/lib/prisma', () => {
    const mockPrisma = {
        cryptoPayment: {
            findUnique: vi.fn(),
            update: vi.fn(),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        user: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
        subscription: {
            findFirst: vi.fn().mockResolvedValue(null),
            findMany: vi.fn().mockResolvedValue([]),
            create: vi.fn().mockResolvedValue({}),
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
            upsert: vi.fn().mockResolvedValue({}),
        },
        $transaction: vi.fn(async (arg: unknown) => {
            if (Array.isArray(arg)) return Promise.all(arg)
            if (typeof arg === 'function') return (arg as (tx: typeof mockPrisma) => unknown)(mockPrisma)
            return undefined
        }),
    }
    return { prisma: mockPrisma }
})

const mockRedisSet = vi.fn()
const mockRedisDel = vi.fn()

vi.mock('@upstash/redis', () => ({
    Redis: class MockRedis {
        set = mockRedisSet
        del = mockRedisDel
    },
}))

const mockCancelDowngrade = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/services/subscription-sync', () => ({
    createCryptoSubscription: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/services/billing-downgrade', () => ({
    BillingDowngradeService: {
        cancelDowngrade: mockCancelDowngrade,
    },
}))

const mockSendCryptoConfirmation = vi.fn().mockResolvedValue({ success: true })

vi.mock('@/lib/resend', () => ({
    getResendClient: vi.fn(),
    sendWelcomeEmail: vi.fn().mockResolvedValue({ success: true }),
    sendSubscriptionCanceledEmail: vi.fn().mockResolvedValue({ success: true }),
    sendPaymentActionRequiredEmail: vi.fn().mockResolvedValue({ success: true }),
    sendFileExpiringEmail: vi.fn().mockResolvedValue({ success: true }),
    sendDropExpiringEmail: vi.fn().mockResolvedValue({ success: true }),
    sendDownloadLimitReachedEmail: vi.fn().mockResolvedValue({ success: true }),
    sendDomainDeletedEmail: vi.fn().mockResolvedValue({ success: true }),
    sendDomainUnverifiedEmail: vi.fn().mockResolvedValue({ success: true }),
    sendMagicLinkEmail: vi.fn().mockResolvedValue({ success: true }),
    sendEmail: vi.fn().mockResolvedValue({ success: true }),
    sendRecipientVerificationEmail: vi.fn().mockResolvedValue({ success: true }),
    sendDowngradeWarningEmail: vi.fn().mockResolvedValue({ success: true }),
    sendResourcesScheduledForRemovalEmail: vi.fn().mockResolvedValue({ success: true }),
    sendResourcesDeletedEmail: vi.fn().mockResolvedValue({ success: true }),
    sendCryptoPaymentConfirmationEmail: mockSendCryptoConfirmation,
    sendCryptoRenewalReminderEmail: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock('@/lib/crypto-prices', () => ({
    getCryptoPrice: vi.fn().mockReturnValue({ usdAmount: 39.49, stripePriceId: 'price_test_yearly', label: 'Bundle Plus (Yearly)' }),
    isValidCryptoProduct: vi.fn().mockReturnValue(true),
    isValidCryptoTier: vi.fn().mockReturnValue(true),
    getCryptoIntervalForStripePriceId: vi.fn((priceId: string) =>
        priceId === 'price_test_monthly' ? 'monthly' as const
            : priceId === 'price_test_yearly' ? 'yearly' as const
                : null
    ),
}))

vi.mock('@/lib/nowpayments', () => ({
    NOWPaymentsClient: {
        verifyIPNSignature: (payload: Record<string, unknown>, signature: string) => {
            const sorted = sortObjectForMock(payload)
            const hmac = crypto.createHmac('sha512', process.env.NOWPAYMENTS_IPN_SECRET || '')
            hmac.update(JSON.stringify(sorted))
            return hmac.digest('hex') === signature
        },
    },
}))

function sortObjectForMock(obj: Record<string, unknown>): Record<string, unknown> {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(obj).sort()) {
        const value = obj[key]
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            sorted[key] = sortObjectForMock(value as Record<string, unknown>)
        } else {
            sorted[key] = value
        }
    }
    return sorted
}

// Must import after mocks
import { POST } from './route'
import { prisma } from '@/lib/prisma'
import { createCryptoSubscription } from '@/lib/services/subscription-sync'

const IPN_SECRET = 'test-ipn-secret'
const originalEnv = process.env

function makeSignature(payload: Record<string, unknown>): string {
    const sorted = sortObject(payload)
    const hmac = crypto.createHmac('sha512', IPN_SECRET)
    hmac.update(JSON.stringify(sorted))
    return hmac.digest('hex')
}

function sortObject(obj: Record<string, unknown>): Record<string, unknown> {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(obj).sort()) {
        const value = obj[key]
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            sorted[key] = sortObject(value as Record<string, unknown>)
        } else {
            sorted[key] = value
        }
    }
    return sorted
}

function makeRequest(body: Record<string, unknown>, signature?: string): Request {
    const completeBody = {
        invoice_id: 'invoice_test',
        price_amount: 39.49,
        price_currency: 'usd',
        pay_amount: 0.001,
        actually_paid: 0.001,
        ...body,
    }
    const sig = signature ?? makeSignature(completeBody)
    return new Request('http://localhost/api/webhooks/nowpayments', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-nowpayments-sig': sig,
        },
        body: JSON.stringify(completeBody),
    })
}

function makeCryptoPayment(overrides: Partial<CryptoPayment> = {}): CryptoPayment {
    return {
        id: 'cp_test',
        nowPaymentId: 'payment_test',
        invoiceId: 'invoice_test',
        orderId: 'crypto_test',
        payAmount: 0.001,
        payCurrency: 'btc',
        priceAmount: 39.49,
        priceCurrency: 'usd',
        actuallyPaid: 0.001,
        product: 'bundle',
        tier: 'plus',
        planPriceId: 'price_test_yearly',
        status: 'waiting',
        periodStart: null,
        periodEnd: null,
        userId: 'user_test',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    }
}

describe('NOWPayments IPN Webhook', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        process.env = {
            ...originalEnv,
            NOWPAYMENTS_IPN_SECRET: IPN_SECRET,
            UPSTASH_REDIS_REST_URL: 'https://fake-redis.upstash.io',
            UPSTASH_REDIS_REST_TOKEN: 'fake-token',
        }
        // Default: SET NX succeeds (claim acquired), DEL succeeds
        mockRedisSet.mockResolvedValue('OK')
        mockRedisDel.mockResolvedValue(1)
    })

    afterEach(() => {
        process.env = originalEnv
    })

    it('should reject requests with invalid signature', async () => {
        const body = { payment_id: '123', payment_status: 'finished', order_id: 'crypto_test' }
        const req = makeRequest(body, 'invalid-signature')
        const res = await POST(req)
        expect(res.status).toBe(400)
    })

    it('should return 200 for valid IPN with unknown orderId', async () => {
        const body = { payment_id: '123', payment_status: 'waiting', order_id: 'crypto_unknown' }
        const req = makeRequest(body)

        ;(prisma.cryptoPayment.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)

        const res = await POST(req)
        expect(res.status).toBe(200)
        expect(mockRedisSet).toHaveBeenNthCalledWith(
            2,
            'nowpay:ipn:123:waiting',
            'done',
            { ex: 86400 * 7 }
        )
    })

    it('should release an incomplete-amount claim so a corrected retry is reprocessed', async () => {
        const orderId = 'crypto_retry_missing_amount'
        const payment = makeCryptoPayment({
            id: 'cp_retry_missing_amount',
            nowPaymentId: 'payment_retry_missing_amount',
            orderId,
            status: 'confirming',
        })
        ;(prisma.cryptoPayment.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(payment)

        const body = {
            payment_id: payment.nowPaymentId,
            payment_status: 'finished',
            order_id: orderId,
            pay_currency: 'btc',
            pay_amount: undefined,
            actually_paid: undefined,
        }
        const failedRes = await POST(makeRequest(body))
        const retryRes = await POST(makeRequest({
            ...body,
            pay_amount: 0.001,
            actually_paid: 0.001,
        }))

        expect(failedRes.status).toBe(500)
        expect(retryRes.status).toBe(200)
        expect(mockRedisDel).toHaveBeenCalledWith(
            'nowpay:ipn:payment_retry_missing_amount:finished'
        )
        expect(prisma.cryptoPayment.findUnique).toHaveBeenCalledTimes(2)
        expect(createCryptoSubscription).toHaveBeenCalledTimes(1)
    })

    it('should update payment status on valid IPN', async () => {
        const body = {
            payment_id: '456',
            invoice_id: 'inv_1',
            payment_status: 'confirming',
            order_id: 'crypto_test123',
            pay_currency: 'btc',
            pay_amount: 0.001,
            actually_paid: 0,
        }
        const req = makeRequest(body)

        ;(prisma.cryptoPayment.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: 'cp_1',
            nowPaymentId: '456',
            invoiceId: 'inv_1',
            orderId: 'crypto_test123',
            payAmount: 0,
            payCurrency: 'pending',
            priceAmount: 39.49,
            priceCurrency: 'usd',
            actuallyPaid: null,
            product: 'bundle',
            tier: 'plus',
            planPriceId: 'price_test_yearly',
            status: 'waiting',
            periodStart: null,
            periodEnd: null,
            userId: 'user_1',
            createdAt: new Date(),
            updatedAt: new Date(),
        })

        const res = await POST(req)
        expect(res.status).toBe(200)
        expect(prisma.cryptoPayment.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ id: 'cp_1' }),
                data: expect.objectContaining({
                    status: 'confirming',
                    payCurrency: 'btc',
                }),
            })
        )
    })

    it('should reject a signed callback bound to a different invoice', async () => {
        const payment = makeCryptoPayment({ status: 'confirming' })
        ;(prisma.cryptoPayment.findUnique as unknown as ReturnType<typeof vi.fn>)
            .mockResolvedValue(payment)

        const res = await POST(makeRequest({
            payment_id: 'payment-other',
            invoice_id: 'invoice-other',
            payment_status: 'finished',
            order_id: payment.orderId,
        }))

        expect(res.status).toBe(200)
        expect(prisma.cryptoPayment.updateMany).not.toHaveBeenCalled()
        expect(prisma.user.update).not.toHaveBeenCalled()
        expect(createCryptoSubscription).not.toHaveBeenCalled()
        expect(mockRedisSet).toHaveBeenNthCalledWith(
            2,
            'nowpay:ipn:payment-other:finished',
            'done',
            { ex: 86400 * 7 },
        )
    })

    it('should activate subscription on finished status', async () => {
        const body = {
            payment_id: '789',
            invoice_id: 'inv_2',
            payment_status: 'finished',
            order_id: 'crypto_finish',
            pay_currency: 'btc',
            pay_amount: 0.001,
            actually_paid: 0.001,
        }
        const req = makeRequest(body)

        ;(prisma.cryptoPayment.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: 'cp_2',
            nowPaymentId: '789',
            invoiceId: 'inv_2',
            orderId: 'crypto_finish',
            payAmount: 0.001,
            payCurrency: 'btc',
            priceAmount: 39.49,
            priceCurrency: 'usd',
            actuallyPaid: null,
            product: 'bundle',
            tier: 'plus',
            planPriceId: 'price_test_yearly',
            status: 'confirming',
            periodStart: null,
            periodEnd: null,
            userId: 'user_2',
            createdAt: new Date(),
            updatedAt: new Date(),
        })

        ;(prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: 'user_2',
            email: 'test@example.com',
        } as Awaited<ReturnType<typeof prisma.user.findUnique>>)

        const res = await POST(req)
        expect(res.status).toBe(200)

        // Should use atomic transaction for activation
        expect((prisma.$transaction as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalled()

        // Should have called cryptoPayment.updateMany and user.update (inside transaction)
        expect(prisma.cryptoPayment.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ id: 'cp_2' }),
                data: expect.objectContaining({
                    status: 'finished',
                }),
            })
        )
        expect(prisma.user.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'user_2' },
                data: expect.objectContaining({
                    paymentMethod: 'crypto',
                }),
            })
        )

        // Should cancel any downgrade (side effect)
        expect(mockCancelDowngrade).toHaveBeenCalledWith('user_2')

        // Yearly invoice: the granted period is one year, and the Stripe price
        // id is stored on the canonical subscription row.
        const subCall = (createCryptoSubscription as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)!
        const [txArg, userIdArg, productArg, tierArg, periodStart, periodEnd, orderIdArg, planPriceIdArg] = subCall as unknown[]
        expect(userIdArg).toBe('user_2')
        expect(productArg).toBe('bundle')
        expect(tierArg).toBe('plus')
        expect(orderIdArg).toBe('crypto_finish')
        expect(planPriceIdArg).toBe('price_test_yearly')
        const days = ((periodEnd as Date).getTime() - (periodStart as Date).getTime()) / (24 * 60 * 60 * 1000)
        expect(days).toBeGreaterThan(363)
        expect(days).toBeLessThan(368)
        expect(txArg).toBeDefined()
    })

    it('should grant a one-month period for a monthly crypto invoice', async () => {
        const orderId = 'crypto_monthly_finish'
        ;(prisma.cryptoPayment.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
            makeCryptoPayment({
                id: 'cp_monthly',
                nowPaymentId: 'payment_monthly',
                orderId,
                priceAmount: 6.99,
                planPriceId: 'price_test_monthly',
                status: 'confirming',
            })
        )

        const res = await POST(makeRequest({
            payment_id: 'payment_monthly',
            payment_status: 'finished',
            order_id: orderId,
            price_amount: 6.99,
        }))

        expect(res.status).toBe(200)
        expect(createCryptoSubscription).toHaveBeenCalledTimes(1)
        const subCall = (createCryptoSubscription as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)!
        const [, , , , periodStart, periodEnd, , planPriceIdArg] = subCall as unknown[]
        expect(planPriceIdArg).toBe('price_test_monthly')
        const days = ((periodEnd as Date).getTime() - (periodStart as Date).getTime()) / (24 * 60 * 60 * 1000)
        expect(days).toBeGreaterThan(27)
        expect(days).toBeLessThan(32)
    })

    it('should fall back to a yearly period for an unrecognized price id', async () => {
        const orderId = 'crypto_unknown_price'
        ;(prisma.cryptoPayment.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
            makeCryptoPayment({
                id: 'cp_unknown_price',
                nowPaymentId: 'payment_unknown_price',
                orderId,
                planPriceId: 'price_never_seen',
                status: 'confirming',
            })
        )

        const res = await POST(makeRequest({
            payment_id: 'payment_unknown_price',
            payment_status: 'finished',
            order_id: orderId,
        }))

        // Fail open on entitlement: a paid invoice activates (yearly, the
        // pre-monthly-support default) instead of being blocked.
        expect(res.status).toBe(200)
        expect(createCryptoSubscription).toHaveBeenCalledTimes(1)
        const subCall = (createCryptoSubscription as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)!
        const [, , , , periodStart, periodEnd] = subCall as unknown[]
        const days = ((periodEnd as Date).getTime() - (periodStart as Date).getTime()) / (24 * 60 * 60 * 1000)
        expect(days).toBeGreaterThan(363)
        expect(days).toBeLessThan(368)
    })

    it('should atomically revoke the canonical entitlement when a finished payment is refunded', async () => {
        const orderId = 'crypto_refunded_order'
        const body = {
            payment_id: 'payment_refund',
            payment_status: 'refunded',
            order_id: orderId,
            pay_currency: 'btc',
            pay_amount: 0.001,
            actually_paid: 0.001,
        }

        ;(prisma.cryptoPayment.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
            makeCryptoPayment({
                id: 'cp_refund',
                nowPaymentId: 'payment_refund',
                orderId,
                status: 'finished',
                periodStart: new Date('2026-01-01T00:00:00.000Z'),
                periodEnd: new Date('2027-01-01T00:00:00.000Z'),
            })
        )

        const res = await POST(makeRequest(body))

        expect(res.status).toBe(200)
        expect(prisma.$transaction).toHaveBeenCalledWith(
            expect.any(Function),
            { isolationLevel: 'Serializable' }
        )
        expect(prisma.cryptoPayment.update).toHaveBeenCalledWith({
            where: { id: 'cp_refund' },
            data: expect.objectContaining({
                nowPaymentId: 'payment_refund',
                status: 'refunded',
            }),
        })
        expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
            where: { providerSubscriptionId: `crypto_${orderId}` },
            data: {
                status: 'canceled',
                currentPeriodEnd: expect.any(Date),
                cancelAtPeriodEnd: false,
            },
        })
        expect(createCryptoSubscription).not.toHaveBeenCalled()
    })

    it('should not let a stale success event restore a refunded entitlement', async () => {
        const orderId = 'crypto_stale_after_refund'
        const payment = makeCryptoPayment({
            id: 'cp_stale_refund',
            nowPaymentId: 'payment_stale_refund',
            orderId,
            status: 'finished',
            periodStart: new Date('2026-01-01T00:00:00.000Z'),
            periodEnd: new Date('2027-01-01T00:00:00.000Z'),
        })
        ;(prisma.cryptoPayment.findUnique as unknown as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce(payment)
            .mockResolvedValueOnce({ ...payment, status: 'refunded' })

        const refundRes = await POST(makeRequest({
            payment_id: payment.nowPaymentId,
            payment_status: 'refunded',
            order_id: orderId,
        }))
        const staleRes = await POST(makeRequest({
            payment_id: payment.nowPaymentId,
            payment_status: 'finished',
            order_id: orderId,
        }))

        expect(refundRes.status).toBe(200)
        expect(staleRes.status).toBe(200)
        expect(prisma.cryptoPayment.update).toHaveBeenCalledTimes(1)
        expect(prisma.cryptoPayment.updateMany).not.toHaveBeenCalled()
        expect(prisma.subscription.updateMany).toHaveBeenCalledTimes(1)
        expect(createCryptoSubscription).not.toHaveBeenCalled()
    })

    it('should not activate when a concurrent refund wins after the initial lookup', async () => {
        const orderId = 'crypto_concurrent_refund'
        ;(prisma.cryptoPayment.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
            makeCryptoPayment({
                id: 'cp_concurrent_refund',
                nowPaymentId: 'payment_concurrent_refund',
                orderId,
                status: 'confirming',
            })
        )
        // The conditional write sees the status changed to `refunded` inside the
        // activation transaction, even though the pre-transaction lookup did not.
        ;(prisma.cryptoPayment.updateMany as unknown as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({ count: 0 })

        const res = await POST(makeRequest({
            payment_id: 'payment_concurrent_refund',
            payment_status: 'finished',
            order_id: orderId,
            pay_currency: 'btc',
            pay_amount: 0.001,
            actually_paid: 0.001,
        }))

        expect(res.status).toBe(200)
        expect(prisma.user.update).not.toHaveBeenCalled()
        expect(createCryptoSubscription).not.toHaveBeenCalled()
        expect(mockCancelDowngrade).not.toHaveBeenCalled()
    })

    it('should skip a duplicate refunded event that is already claimed', async () => {
        const orderId = 'crypto_duplicate_refund'
        const body = {
            payment_id: 'payment_duplicate_refund',
            payment_status: 'refunded',
            order_id: orderId,
        }
        ;(prisma.cryptoPayment.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
            makeCryptoPayment({
                id: 'cp_duplicate_refund',
                nowPaymentId: 'payment_duplicate_refund',
                orderId,
                status: 'finished',
            })
        )
        // First claim, first completion marker, duplicate claim.
        mockRedisSet
            .mockResolvedValueOnce('OK')
            .mockResolvedValueOnce('OK')
            .mockResolvedValueOnce(null)

        const firstRes = await POST(makeRequest(body))
        const duplicateRes = await POST(makeRequest(body))

        expect(firstRes.status).toBe(200)
        expect(duplicateRes.status).toBe(200)
        expect(prisma.cryptoPayment.findUnique).toHaveBeenCalledTimes(1)
        expect(prisma.$transaction).toHaveBeenCalledTimes(1)
        expect(prisma.subscription.updateMany).toHaveBeenCalledTimes(1)
    })

    it('should skip IPN for terminal statuses', async () => {
        const body = {
            payment_id: '999',
            invoice_id: 'inv_3',
            payment_status: 'waiting',
            order_id: 'crypto_terminal',
            pay_currency: 'btc',
            pay_amount: 0.001,
        }
        const req = makeRequest(body)

        ;(prisma.cryptoPayment.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: 'cp_3',
            nowPaymentId: '999',
            invoiceId: 'inv_3',
            orderId: 'crypto_terminal',
            payAmount: 0.001,
            payCurrency: 'btc',
            priceAmount: 39.49,
            priceCurrency: 'usd',
            actuallyPaid: 0.001,
            product: 'bundle',
            tier: 'plus',
            planPriceId: 'price_test',
            status: 'finished', // Terminal status
            periodStart: new Date(),
            periodEnd: new Date(),
            userId: 'user_3',
            createdAt: new Date(),
            updatedAt: new Date(),
        })

        const res = await POST(req)
        expect(res.status).toBe(200)
        // Should NOT update the payment
        expect(prisma.cryptoPayment.update).not.toHaveBeenCalled()
        expect(prisma.cryptoPayment.updateMany).not.toHaveBeenCalled()
    })

    it('should skip already-processed IPN events (idempotency)', async () => {
        const body = {
            payment_id: '111',
            payment_status: 'finished',
            order_id: 'crypto_idem',
        }
        const req = makeRequest(body)

        // SET NX returns null = key already exists (already claimed/processed)
        mockRedisSet.mockResolvedValueOnce(null)

        const res = await POST(req)
        expect(res.status).toBe(200)
        // Should NOT look up payment
        expect(prisma.cryptoPayment.findUnique).not.toHaveBeenCalled()
    })
})
