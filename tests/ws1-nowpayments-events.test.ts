/**
 * @vitest-environment node
 *
 * WS1 instrumentation on the NOWPayments webhook: crypto_invoice_expired,
 * purchase_failed (failed / price_mismatch / underpaid), subscription_canceled
 * (refunded), and crypto_invoice_paid + enriched subscription_activated on
 * success.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const postHog = vi.hoisted(() => ({
    capture: vi.fn(),
    captureException: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
}))
const cryptoPaymentFindUnique = vi.hoisted(() => vi.fn())
const cryptoPaymentUpdateMany = vi.hoisted(() => vi.fn())
const subscriptionUpdateMany = vi.hoisted(() => vi.fn())
const userUpdate = vi.hoisted(() => vi.fn())
const createCryptoSubscription = vi.hoisted(() => vi.fn())

vi.mock("posthog-node", () => ({
    PostHog: class MockPostHog {
        capture = postHog.capture
        captureException = postHog.captureException
        flush = postHog.flush
    },
}))
vi.mock("next/server", async (importOriginal) => {
    const original = await importOriginal<typeof import("next/server")>()
    return { ...original, after: vi.fn() }
})
vi.mock("@/lib/nowpayments", () => ({
    NOWPaymentsClient: { verifyIPNSignature: () => true },
    getNOWPaymentsClient: vi.fn(),
}))
vi.mock("@upstash/redis", () => ({
    Redis: class {
        set = vi.fn().mockResolvedValue("OK")
        del = vi.fn().mockResolvedValue(1)
    },
}))
vi.mock("@/lib/prisma", () => ({
    prisma: {
        cryptoPayment: { findUnique: cryptoPaymentFindUnique, updateMany: cryptoPaymentUpdateMany, update: vi.fn() },
        subscription: { updateMany: subscriptionUpdateMany },
        user: { update: userUpdate },
        $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb({
            cryptoPayment: { updateMany: cryptoPaymentUpdateMany, update: vi.fn().mockResolvedValue({}) },
            subscription: { updateMany: subscriptionUpdateMany },
            user: { update: userUpdate },
        })),
    },
}))
vi.mock("@/lib/crypto-prices", () => ({
    isValidCryptoProduct: () => true,
    isValidCryptoTier: () => true,
    getCryptoPrice: () => ({ usdAmount: 39.49, stripePriceId: "price_bundle_plus_yearly", label: "Bundle Plus" }),
    getCryptoIntervalForStripePriceId: (priceId: string) =>
        priceId === "price_bundle_plus_monthly" ? "monthly" as const
            : priceId === "price_bundle_plus_yearly" ? "yearly" as const
                : null,
}))
vi.mock("@/lib/services/subscription-sync", () => ({
    createCryptoSubscription,
}))
vi.mock("@/lib/services/billing-downgrade", () => ({
    BillingDowngradeService: { cancelDowngrade: vi.fn().mockResolvedValue(undefined) },
}))
vi.mock("@/lib/data/user", () => ({
    getUserBillingState: vi.fn().mockResolvedValue({ email: "user@example.com" }),
}))

import { POST } from "@/app/api/webhooks/nowpayments/route"

const payment = {
    id: "pay-1",
    invoiceId: "invoice-1",
    orderId: "crypto_ord_1",
    userId: "user-1",
    product: "bundle",
    tier: "plus",
    planPriceId: "price_bundle_plus_yearly",
    priceAmount: 39.49,
    priceCurrency: "usd",
    payCurrency: "btc",
    payAmount: 0.001,
    actuallyPaid: 0,
    status: "waiting",
}

async function deliver(body: Record<string, unknown>) {
    const completeBody = {
        invoice_id: "invoice-1",
        price_amount: 39.49,
        price_currency: "usd",
        pay_amount: 0.001,
        actually_paid: 0.001,
        ...body,
    }
    const req = new Request("http://localhost/api/webhooks/nowpayments", {
        method: "POST",
        headers: { "x-nowpayments-sig": "sig", "content-type": "application/json" },
        body: JSON.stringify(completeBody),
    })
    return POST(req)
}

function captured(event: string) {
    return postHog.capture.mock.calls
        .map((call) => call[0] as { distinctId: string; event: string; properties: Record<string, unknown> })
        .filter((c) => c.event === event)
}

describe("nowpayments webhook revenue events", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test"
        cryptoPaymentFindUnique.mockResolvedValue(payment)
        cryptoPaymentUpdateMany.mockResolvedValue({ count: 1 })
        subscriptionUpdateMany.mockResolvedValue({ count: 1 })
        userUpdate.mockResolvedValue({})
        createCryptoSubscription.mockResolvedValue(undefined)
    })

    it("emits crypto_invoice_expired for the expired terminal status", async () => {
        const res = await deliver({ payment_id: "p1", payment_status: "expired", order_id: "crypto_ord_1" })

        expect(res.status).toBe(200)
        expect(captured("crypto_invoice_expired")).toEqual([expect.objectContaining({
            distinctId: "user-1",
            properties: expect.objectContaining({
                product: "bundle",
                tier: "plus",
                amount: 39.49,
                order_id: "crypto_ord_1",
                source: "webhook",
            }),
        })])
        expect(captured("purchase_failed")).toHaveLength(0)
    })

    it("emits purchase_failed for the failed status", async () => {
        await deliver({ payment_id: "p2", payment_status: "failed", order_id: "crypto_ord_1" })

        expect(captured("purchase_failed")).toEqual([expect.objectContaining({
            distinctId: "user-1",
            properties: expect.objectContaining({
                provider: "crypto",
                failure_reason: "failed",
                order_id: "crypto_ord_1",
            }),
        })])
    })

    it("emits purchase_failed on price mismatch and blocks activation", async () => {
        cryptoPaymentFindUnique.mockResolvedValue({ ...payment, priceAmount: 999 })

        await deliver({
            payment_id: "p3",
            payment_status: "finished",
            order_id: "crypto_ord_1",
            actually_paid: "0.001",
            pay_amount: "0.001",
        })

        expect(captured("purchase_failed")).toEqual([expect.objectContaining({
            properties: expect.objectContaining({ provider: "crypto", failure_reason: "price_mismatch" }),
        })])
        expect(captured("subscription_activated")).toHaveLength(0)
        expect(createCryptoSubscription).not.toHaveBeenCalled()
    })

    it("emits subscription_canceled on refund", async () => {
        const res = await deliver({ payment_id: "p4", payment_status: "refunded", order_id: "crypto_ord_1" })

        expect(res.status).toBe(200)
        expect(captured("subscription_canceled")).toEqual([expect.objectContaining({
            distinctId: "user-1",
            properties: expect.objectContaining({
                provider: "crypto",
                cancel_reason: "refunded",
                order_id: "crypto_ord_1",
            }),
        })])
    })

    it("emits crypto_invoice_paid and an enriched subscription_activated on success", async () => {
        const res = await deliver({
            payment_id: "p5",
            payment_status: "finished",
            order_id: "crypto_ord_1",
            actually_paid: "0.001",
            pay_amount: "0.001",
        })

        expect(res.status).toBe(200)
        expect(createCryptoSubscription).toHaveBeenCalled()
        expect(captured("crypto_invoice_paid")).toEqual([expect.objectContaining({
            distinctId: "user-1",
            properties: expect.objectContaining({
                product: "bundle",
                tier: "plus",
                amount: 39.49,
                order_id: "crypto_ord_1",
            }),
        })])
        expect(captured("subscription_activated")).toEqual([expect.objectContaining({
            distinctId: "user-1",
            properties: expect.objectContaining({
                provider: "crypto",
                frequency: "yearly",
                billing_reason: "new",
                order_id: "crypto_ord_1",
            }),
        })])
    })

    it("emits subscription_activated with frequency monthly for a monthly invoice", async () => {
        cryptoPaymentFindUnique.mockResolvedValue({
            ...payment,
            planPriceId: "price_bundle_plus_monthly",
            priceAmount: 6.99,
        })

        const res = await deliver({
            payment_id: "p6",
            payment_status: "finished",
            order_id: "crypto_ord_1",
            price_amount: 6.99,
            actually_paid: "0.001",
            pay_amount: "0.001",
        })

        expect(res.status).toBe(200)
        expect(captured("subscription_activated")).toEqual([expect.objectContaining({
            distinctId: "user-1",
            properties: expect.objectContaining({
                provider: "crypto",
                frequency: "monthly",
                order_id: "crypto_ord_1",
            }),
        })])
    })
})
