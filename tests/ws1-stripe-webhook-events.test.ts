/**
 * @vitest-environment node
 *
 * WS1 instrumentation on the Stripe webhook: purchase_failed (dunning signal
 * via billing_reason), subscription_canceled (churn signal via cancel_reason),
 * and the enriched subscription_activated (product/tier/billing_reason).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const postHog = vi.hoisted(() => ({
    capture: vi.fn(),
    captureException: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
}))
const constructEvent = vi.hoisted(() => vi.fn())
const subscriptionsRetrieve = vi.hoisted(() => vi.fn())
const subscriptionFindUnique = vi.hoisted(() => vi.fn())
const dropUpdateMany = vi.hoisted(() => vi.fn())
const upsertStripeSubscription = vi.hoisted(() => vi.fn())
const recordDowngrade = vi.hoisted(() => vi.fn())
const cancelDowngrade = vi.hoisted(() => vi.fn())
const calculateExcess = vi.hoisted(() => vi.fn())

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
vi.mock("next/headers", () => ({
    headers: vi.fn().mockResolvedValue(new Headers({ "Stripe-Signature": "sig_test" })),
}))
vi.mock("@/lib/stripe", () => ({
    stripe: {
        webhooks: { constructEvent },
        subscriptions: { retrieve: subscriptionsRetrieve },
        customers: { retrieve: vi.fn() },
    },
}))
vi.mock("@upstash/redis", () => ({
    Redis: class {
        set = vi.fn().mockResolvedValue("OK")
        del = vi.fn().mockResolvedValue(1)
    },
}))
vi.mock("@/lib/services/subscription-sync", () => ({
    upsertStripeSubscription,
}))
vi.mock("@/lib/prisma", () => ({
    prisma: {
        subscription: { findUnique: subscriptionFindUnique },
        drop: { updateMany: dropUpdateMany },
        organization: { update: vi.fn() },
    },
}))
vi.mock("@/lib/services/billing-downgrade", () => ({
    BillingDowngradeService: { recordDowngrade, cancelDowngrade, calculateExcess },
}))
vi.mock("@/lib/data/user", () => ({
    getUserIdByEmail: vi.fn().mockResolvedValue(null),
    getUserIdByStripeCustomerId: vi.fn().mockResolvedValue(null),
}))

import { POST } from "@/app/api/webhooks/stripe/route"

const localRow = {
    userId: "user-1",
    organizationId: null,
    product: "bundle",
    tier: "plus",
    user: { id: "user-1", email: "user@example.com" },
}

function subscriptionFixture(overrides: Record<string, unknown> = {}) {
    return {
        id: "sub_1",
        status: "active",
        metadata: {},
        items: {
            data: [{
                price: {
                    // Use the env-configured price id so getPlanFromPriceId
                    // resolves regardless of whether .env or the setup seeds win.
                    id: process.env.STRIPE_BUNDLE_PLUS_MONTHLY_PRICE_ID,
                    unit_amount: 699,
                    currency: "eur",
                    recurring: { interval: "month" },
                },
            }],
        },
        ...overrides,
    }
}

async function deliver(event: Record<string, unknown>) {
    constructEvent.mockReturnValue(event)
    const req = new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        headers: { "Stripe-Signature": "sig_test" },
        body: "{}",
    })
    return POST(req)
}

function captured(event: string) {
    return postHog.capture.mock.calls
        .map((call) => call[0] as { distinctId: string; event: string; properties: Record<string, unknown> })
        .filter((c) => c.event === event)
}

describe("stripe webhook revenue events", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test"
        upsertStripeSubscription.mockResolvedValue(true)
        subscriptionFindUnique.mockResolvedValue(localRow)
        dropUpdateMany.mockResolvedValue({ count: 0 })
        recordDowngrade.mockResolvedValue(undefined)
        cancelDowngrade.mockResolvedValue(undefined)
        calculateExcess.mockResolvedValue({
            excessRandom: 0, excessCustom: 0, excessDomains: 0, excessRecipients: 0,
        })
    })

    it("emits purchase_failed with billing_reason on a renewal payment failure", async () => {
        subscriptionsRetrieve.mockResolvedValue(subscriptionFixture())
        const res = await deliver({
            id: "evt_fail_1",
            type: "invoice.payment_failed",
            data: {
                object: {
                    id: "in_1",
                    subscription: "sub_1",
                    billing_reason: "subscription_cycle",
                    amount_due: 699,
                    currency: "eur",
                    last_finalization_error: { code: "card_declined" },
                },
            },
        })

        expect(res.status).toBe(200)
        expect(captured("purchase_failed")).toEqual([expect.objectContaining({
            distinctId: "user-1",
            properties: expect.objectContaining({
                provider: "stripe",
                product: "bundle",
                tier: "plus",
                billing_reason: "subscription_cycle",
                failure_code: "card_declined",
                invoice_id: "in_1",
            }),
        })])
    })

    it("distinguishes first-charge failures (subscription_create)", async () => {
        subscriptionsRetrieve.mockResolvedValue(subscriptionFixture())
        await deliver({
            id: "evt_fail_2",
            type: "invoice.payment_failed",
            data: {
                object: {
                    id: "in_2",
                    subscription: "sub_1",
                    billing_reason: "subscription_create",
                    amount_due: 699,
                    currency: "eur",
                    last_finalization_error: null,
                },
            },
        })

        expect(captured("purchase_failed")[0]!.properties).toMatchObject({
            billing_reason: "subscription_create",
            failure_code: "unknown",
        })
    })

    it("emits subscription_canceled with the involuntary-churn reason", async () => {
        subscriptionsRetrieve.mockResolvedValue(subscriptionFixture({
            status: "canceled",
            cancellation_details: { reason: "payment_failed" },
        }))
        const res = await deliver({
            id: "evt_del_1",
            type: "customer.subscription.deleted",
            data: {
                object: subscriptionFixture({
                    status: "canceled",
                    cancellation_details: { reason: "payment_failed" },
                }),
            },
        })

        expect(res.status).toBe(200)
        expect(captured("subscription_canceled")).toEqual([expect.objectContaining({
            distinctId: "user-1",
            properties: expect.objectContaining({
                provider: "stripe",
                product: "bundle",
                tier: "plus",
                cancel_reason: "payment_failed",
            }),
        })])
    })

    it("enriches subscription_activated with product, tier and billing_reason", async () => {
        subscriptionsRetrieve.mockResolvedValue(subscriptionFixture({ id: "sub_3" }))
        const res = await deliver({
            id: "evt_co_1",
            type: "checkout.session.completed",
            data: {
                object: {
                    id: "cs_1",
                    metadata: { userId: "user-1" },
                    client_reference_id: "user-1",
                    subscription: "sub_3",
                },
            },
        })

        expect(res.status).toBe(200)
        expect(captured("subscription_activated")).toEqual([expect.objectContaining({
            distinctId: "user-1",
            properties: expect.objectContaining({
                provider: "stripe",
                product: "bundle",
                tier: "plus",
                billing_reason: "new",
            }),
        })])
    })
})
