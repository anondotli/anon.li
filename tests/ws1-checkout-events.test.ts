/**
 * @vitest-environment node
 *
 * WS1 instrumentation: `checkout_started` (personal + team) and
 * `crypto_invoice_created` are emitted server-side when the checkout
 * session/invoice is actually created — the canonical top of the revenue
 * funnel (the client-side checkout_started was removed).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
    // config/plans.ts reads these at import; team checkout requires the
    // business price id to be configured.
    process.env.STRIPE_BUSINESS_MONTHLY_PRICE_ID ??= "price_business_monthly"
    process.env.STRIPE_BUSINESS_YEARLY_PRICE_ID ??= "price_business_yearly"
    return {}
})

const postHog = vi.hoisted(() => ({
    capture: vi.fn(),
    captureException: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("posthog-node", () => ({
    PostHog: class MockPostHog {
        capture = postHog.capture
        captureException = postHog.captureException
        flush = postHog.flush
    },
}))

const authMock = vi.hoisted(() => vi.fn())
const sessionsCreate = vi.hoisted(() => vi.fn())
const subscriptionFindFirst = vi.hoisted(() => vi.fn())
const memberCount = vi.hoisted(() => vi.fn())
const createInvoice = vi.hoisted(() => vi.fn())
const createCryptoPayment = vi.hoisted(() => vi.fn())

vi.mock("@/auth", () => ({ auth: authMock }))
vi.mock("next/navigation", () => ({ redirect: vi.fn() }))
vi.mock("@/lib/safe-action", () => ({
    runSecureAction: vi.fn(async (_opts: unknown, cb: (data: undefined, userId: string) => Promise<string>) => {
        try {
            return { data: await cb(undefined, "user-1") }
        } catch (error) {
            return { error: (error as Error).message }
        }
    }),
    runScopedAction: vi.fn(async (_opts: unknown, cb: (data: undefined, scope: unknown) => Promise<string>) => {
        try {
            return { data: await cb(undefined, { userId: "user-1", organizationId: "org-1", role: "owner" }) }
        } catch (error) {
            return { error: (error as Error).message }
        }
    }),
}))
vi.mock("@/lib/stripe", () => ({
    stripe: {
        checkout: { sessions: { create: sessionsCreate } },
        promotionCodes: { list: vi.fn().mockResolvedValue({ data: [] }) },
    },
}))
vi.mock("@/lib/prisma", () => ({
    prisma: {
        subscription: { findFirst: subscriptionFindFirst },
        member: { count: memberCount },
    },
}))
vi.mock("@/lib/nowpayments", () => ({
    getNOWPaymentsClient: () => ({ createInvoice }),
}))
vi.mock("@/lib/data/crypto-payment", () => ({
    createCryptoPayment,
}))

import { createCheckoutSession } from "@/actions/create-checkout-session"
import { createTeamCheckoutSession } from "@/actions/create-team-checkout"
import { createCryptoCheckout } from "@/actions/create-crypto-checkout"

function capturedEvents() {
    return postHog.capture.mock.calls.map((call) => call[0] as {
        distinctId: string
        event: string
        properties: Record<string, unknown>
    })
}

describe("checkout funnel events", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test"
        authMock.mockResolvedValue({ user: { id: "user-1", email: "user@example.com" } })
        subscriptionFindFirst.mockResolvedValue(null)
        memberCount.mockResolvedValue(1)
        sessionsCreate.mockResolvedValue({ id: "cs_test_1", url: "https://checkout.stripe.example/cs_test_1" })
        createInvoice.mockResolvedValue({ id: 42, invoice_url: "https://nowpayments.example/invoice" })
        createCryptoPayment.mockResolvedValue({})
    })

    it("emits checkout_started (personal) when the Stripe session is created", async () => {
        await createCheckoutSession({ product: "bundle", tier: "plus", frequency: "monthly" })

        // price_id values are long token-like strings; the telemetry sanitizer
        // redacts them by design, so only the dimensions are asserted.
        expect(capturedEvents()).toContainEqual(expect.objectContaining({
            distinctId: "user-1",
            event: "checkout_started",
            properties: expect.objectContaining({
                provider: "stripe",
                product: "bundle",
                tier: "plus",
                frequency: "monthly",
                flow: "personal",
                has_promo_code: false,
            }),
        }))
    })

    it("emits checkout_started (team) with the seat count", async () => {
        await createTeamCheckoutSession({ frequency: "monthly", seats: 4 })

        expect(capturedEvents()).toContainEqual(expect.objectContaining({
            distinctId: "user-1",
            event: "checkout_started",
            properties: expect.objectContaining({
                product: "business",
                frequency: "monthly",
                seats: 4,
                flow: "team",
            }),
        }))
    })

    it("emits crypto_invoice_created when a NOWPayments invoice is created", async () => {
        await createCryptoCheckout({ product: "bundle", tier: "plus" })

        const events = capturedEvents()
        expect(events).toContainEqual(expect.objectContaining({
            distinctId: "user-1",
            event: "crypto_invoice_created",
            properties: expect.objectContaining({
                product: "bundle",
                tier: "plus",
                amount: expect.any(Number),
            }),
        }))
        // The payment row is written before the funnel event is emitted.
        expect(createCryptoPayment).toHaveBeenCalled()
        const captureOrder = postHog.capture.mock.invocationCallOrder[0]!
        expect(createCryptoPayment.mock.invocationCallOrder[0]!).toBeLessThan(captureOrder)
    })

    it("emits nothing when no checkout session could be created", async () => {
        sessionsCreate.mockResolvedValue({ id: "cs_test_2", url: null })

        await expect(
            createCheckoutSession({ product: "bundle", tier: "plus", frequency: "monthly" }),
        ).resolves.toMatchObject({ error: expect.any(String) })

        expect(capturedEvents()).toHaveLength(0)
    })
})
