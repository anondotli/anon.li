import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import crypto from 'crypto'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/prisma', () => ({
    prisma: {
        cryptoPayment: {
            findUnique: vi.fn(),
            update: vi.fn(),
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
        },
        $transaction: vi.fn().mockResolvedValue([{}, {}]),
    },
}))

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
    const sig = signature ?? makeSignature(body)
    return new Request('http://localhost/api/webhooks/nowpayments', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-nowpayments-sig': sig,
        },
        body: JSON.stringify(body),
    })
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
    })

    it('should update payment status on valid IPN', async () => {
        const body = {
            payment_id: '456',
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
        expect(prisma.cryptoPayment.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'cp_1' },
                data: expect.objectContaining({
                    status: 'confirming',
                    payCurrency: 'btc',
                }),
            })
        )
    })

    it('should activate subscription on finished status', async () => {
        const body = {
            payment_id: '789',
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

        // Should have called cryptoPayment.update and user.update (inside transaction)
        expect(prisma.cryptoPayment.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'cp_2' },
                data: expect.objectContaining({
                    status: 'finished',
                }),
            })
        )
        expect(prisma.user.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'user_2' },
                data: expect.objectContaining({
                    stripePriceId: 'price_test_yearly',
                    paymentMethod: 'crypto',
                }),
            })
        )

        // Should cancel any downgrade (side effect)
        expect(mockCancelDowngrade).toHaveBeenCalledWith('user_2')
    })

    it('should skip IPN for terminal statuses', async () => {
        const body = {
            payment_id: '999',
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
