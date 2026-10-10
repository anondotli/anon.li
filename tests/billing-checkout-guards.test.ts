/**
 * @vitest-environment node
 *
 * Checkout guards: a subscription in dunning (past_due/unpaid) is still live
 * at Stripe, so starting another checkout would double-bill; a running CRYPTO
 * subscription is renewable (crypto never auto-renews). Checkout sessions also
 * carry the plan in metadata for the expired-checkout recovery flow.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
    process.env.STRIPE_BUSINESS_MONTHLY_PRICE_ID ??= "price_business_monthly"
    process.env.STRIPE_BUSINESS_YEARLY_PRICE_ID ??= "price_business_yearly"
    return {}
})

const authMock = vi.hoisted(() => vi.fn())
const sessionsCreate = vi.hoisted(() => vi.fn())
const subscriptionFindFirst = vi.hoisted(() => vi.fn())
const memberCount = vi.hoisted(() => vi.fn())
const createInvoice = vi.hoisted(() => vi.fn())
const createCryptoPayment = vi.hoisted(() => vi.fn())

vi.mock("@/lib/posthog.server", () => ({
    trackServerEvent: vi.fn(),
    captureServerEvent: vi.fn(),
    flushPostHog: vi.fn(),
}))
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

describe("checkout guards", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        authMock.mockResolvedValue({ user: { id: "user-1", email: "user@example.com" } })
        subscriptionFindFirst.mockResolvedValue(null)
        memberCount.mockResolvedValue(1)
        sessionsCreate.mockResolvedValue({ id: "cs_test", url: "https://checkout.stripe.example/cs_test" })
        createInvoice.mockResolvedValue({ id: 42, invoice_url: "https://nowpayments.example/invoice" })
        createCryptoPayment.mockResolvedValue({})
    })

    it("blocks a personal checkout while a subscription is past_due", async () => {
        subscriptionFindFirst.mockResolvedValue({ status: "past_due" })

        const result = await createCheckoutSession({ product: "bundle", tier: "plus", frequency: "monthly" })

        expect(result).toMatchObject({ error: expect.stringContaining("billing portal") })
        expect(sessionsCreate).not.toHaveBeenCalled()
        expect(subscriptionFindFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                userId: "user-1",
                organizationId: null,
                // Only genuine, recent dunning blocks: a stale or terminally
                // lost past_due row must not block checkout forever.
                OR: expect.arrayContaining([{
                    provider: "stripe",
                    status: "past_due",
                    lossNotifiedAt: null,
                    updatedAt: { gt: expect.any(Date) },
                }]),
            }),
        }))
    })

    it("blocks a team checkout while the org subscription is past_due", async () => {
        subscriptionFindFirst.mockResolvedValue({ status: "past_due" })

        const result = await createTeamCheckoutSession({ frequency: "monthly", seats: 2 })

        expect(result).toMatchObject({ error: expect.stringContaining("billing portal") })
        expect(sessionsCreate).not.toHaveBeenCalled()
    })

    it("stamps the plan into checkout session metadata", async () => {
        await createCheckoutSession({ product: "drop", tier: "pro", frequency: "yearly" })

        expect(sessionsCreate).toHaveBeenCalledWith(expect.objectContaining({
            metadata: expect.objectContaining({
                userId: "user-1",
                product: "drop",
                tier: "pro",
                frequency: "yearly",
                priceId: expect.any(String),
            }),
        }))
    })

    it("lets a running crypto subscriber renew (only non-crypto subscriptions block)", async () => {
        const result = await createCryptoCheckout({ product: "bundle", tier: "plus", interval: "monthly" })

        expect(result).toBeUndefined()
        expect(createInvoice).toHaveBeenCalled()
        expect(subscriptionFindFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ provider: { not: "crypto" } }),
        }))
    })

    it("blocks a crypto checkout while a card subscription is past_due", async () => {
        subscriptionFindFirst.mockResolvedValue({ status: "past_due" })

        const result = await createCryptoCheckout({ product: "bundle", tier: "plus", interval: "monthly" })

        expect(result).toMatchObject({ error: expect.stringContaining("billing portal") })
        expect(createInvoice).not.toHaveBeenCalled()
    })

    it("blocks a crypto checkout while a card subscription is active", async () => {
        subscriptionFindFirst.mockResolvedValue({ status: "active" })

        const result = await createCryptoCheckout({ product: "bundle", tier: "plus", interval: "monthly" })

        expect(result).toMatchObject({ error: expect.stringContaining("already have an active subscription") })
        expect(createInvoice).not.toHaveBeenCalled()
    })
})
