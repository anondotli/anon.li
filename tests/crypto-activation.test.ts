/**
 * @vitest-environment node
 *
 * Held crypto payments (needs_review): first hold notifies once, the daily
 * re-check activates them once the Stripe conflict is gone, and the admin
 * action activates explicitly. Also: crypto expiry loss handling is retryable.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const mocks = vi.hoisted(() => ({
    cryptoPaymentUpdateMany: vi.fn(),
    cryptoPaymentFindUnique: vi.fn(),
    cryptoPaymentFindMany: vi.fn(),
    subscriptionFindFirst: vi.fn(),
    subscriptionFindMany: vi.fn(),
    subscriptionUpdateMany: vi.fn(),
    userUpdate: vi.fn(),
    findConflicting: vi.fn(),
    createCryptoSubscription: vi.fn(),
    cancelDowngrade: vi.fn(),
    hasActivePersonalSubscription: vi.fn(),
    handlePersonalSubscriptionLoss: vi.fn(),
    sendEmail: vi.fn(),
    sendConfirmation: vi.fn(),
    trackServerEvent: vi.fn(),
    captureServerEvent: vi.fn(),
    flushPostHog: vi.fn(),
}))

vi.mock("@/lib/prisma", () => {
    const client = {
        cryptoPayment: {
            updateMany: mocks.cryptoPaymentUpdateMany,
            findUnique: mocks.cryptoPaymentFindUnique,
            findMany: mocks.cryptoPaymentFindMany,
        },
        subscription: {
            findFirst: mocks.subscriptionFindFirst,
            findMany: mocks.subscriptionFindMany,
            updateMany: mocks.subscriptionUpdateMany,
        },
        user: { update: mocks.userUpdate },
        $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(client)),
    }
    return { prisma: client }
})
vi.mock("@/lib/data/user", () => ({ getUserBillingState: vi.fn().mockResolvedValue({ email: "u@example.com" }) }))
vi.mock("@/lib/crypto-prices", () => ({
    getCryptoIntervalForStripePriceId: (id: string) => (id === "price_monthly" ? "monthly" : null),
}))
vi.mock("@/lib/services/subscription-sync", () => ({
    findConflictingStripeSubscription: mocks.findConflicting,
    createCryptoSubscription: mocks.createCryptoSubscription,
}))
vi.mock("@/lib/services/billing-downgrade", () => ({
    BillingDowngradeService: {
        cancelDowngrade: mocks.cancelDowngrade,
        hasActivePersonalSubscription: mocks.hasActivePersonalSubscription,
        handlePersonalSubscriptionLoss: mocks.handlePersonalSubscriptionLoss,
    },
}))
vi.mock("@/lib/resend", () => ({
    sendEmail: mocks.sendEmail,
    sendCryptoPaymentConfirmationEmail: mocks.sendConfirmation,
}))
vi.mock("@/lib/posthog.server", () => ({
    trackServerEvent: mocks.trackServerEvent,
    captureServerEvent: mocks.captureServerEvent,
    flushPostHog: mocks.flushPostHog,
}))

import { activateCryptoPayment, recheckHeldCryptoPayments } from "@/lib/services/crypto-activation"
import { expireLapsedCryptoSubscriptions } from "@/lib/services/crypto-subscription"

const payment = {
    id: "cp_1",
    userId: "user_1",
    orderId: "crypto_ord_1",
    product: "bundle",
    tier: "plus",
    planPriceId: "price_monthly",
    priceAmount: 6.99,
}

beforeEach(() => {
    vi.clearAllMocks()
    mocks.cryptoPaymentUpdateMany.mockResolvedValue({ count: 1 })
    mocks.subscriptionFindFirst.mockResolvedValue(null)
    mocks.findConflicting.mockResolvedValue(null)
    mocks.sendEmail.mockResolvedValue({ success: true })
    mocks.sendConfirmation.mockResolvedValue({ success: true })
})

describe("activateCryptoPayment holds", () => {
    it("tracks and emails only on the first transition into review", async () => {
        mocks.findConflicting.mockResolvedValue({ id: "row_stripe", status: "active" })

        const first = await activateCryptoPayment(payment, { status: "finished" })
        expect(first).toEqual({ kind: "held", firstHold: true, conflict: { id: "row_stripe", status: "active" } })
        expect(mocks.cryptoPaymentUpdateMany).toHaveBeenCalledWith({
            where: { id: "cp_1", status: { notIn: ["finished", "failed", "refunded", "expired", "needs_review"] } },
            data: { status: "needs_review" },
        })
        expect(mocks.trackServerEvent).toHaveBeenCalledWith("user_1", "purchase_failed", expect.objectContaining({
            failure_reason: "subscription_conflict",
        }))
        expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
            to: "u@example.com",
            subject: "We received your crypto payment",
        }))

        vi.clearAllMocks()
        mocks.findConflicting.mockResolvedValue({ id: "row_stripe", status: "active" })
        mocks.cryptoPaymentUpdateMany.mockResolvedValue({ count: 0 })
        mocks.cryptoPaymentFindUnique.mockResolvedValue({ status: "needs_review" })

        const repeat = await activateCryptoPayment(payment, { status: "finished" })
        expect(repeat).toMatchObject({ kind: "held", firstHold: false })
        expect(mocks.trackServerEvent).not.toHaveBeenCalled()
        expect(mocks.sendEmail).not.toHaveBeenCalled()
        expect(mocks.createCryptoSubscription).not.toHaveBeenCalled()
    })

    it("activates past a conflict only when explicitly told to (admin)", async () => {
        mocks.findConflicting.mockResolvedValue({ id: "row_stripe", status: "active" })

        const outcome = await activateCryptoPayment(payment, { status: "finished" }, { ignoreConflict: true })

        expect(outcome.kind).toBe("activated")
        expect(mocks.findConflicting).not.toHaveBeenCalled()
        expect(mocks.createCryptoSubscription).toHaveBeenCalledTimes(1)
        expect(mocks.cancelDowngrade).toHaveBeenCalledWith("user_1")
    })
})

describe("recheckHeldCryptoPayments", () => {
    it("activates held payments whose Stripe conflict is gone and keeps the rest held", async () => {
        mocks.cryptoPaymentFindMany.mockResolvedValue([payment, { ...payment, id: "cp_2", orderId: "crypto_ord_2" }])
        mocks.findConflicting
            .mockResolvedValueOnce(null) // cp_1: conflict resolved
            .mockResolvedValueOnce({ id: "row_stripe", status: "active" }) // cp_2: still live
        mocks.cryptoPaymentUpdateMany
            .mockResolvedValueOnce({ count: 1 }) // cp_1 activation
            .mockResolvedValueOnce({ count: 0 }) // cp_2 already needs_review
        mocks.cryptoPaymentFindUnique.mockResolvedValue({ status: "needs_review" })

        const result = await recheckHeldCryptoPayments()

        expect(mocks.cryptoPaymentFindMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { status: "needs_review" },
        }))
        expect(result).toEqual({ checked: 2, activated: 1, errors: 0 })
        expect(mocks.createCryptoSubscription).toHaveBeenCalledTimes(1)
        // The still-held payment is not re-announced.
        expect(mocks.sendEmail).not.toHaveBeenCalled()
    })
})

describe("expireLapsedCryptoSubscriptions retry", () => {
    it("reverts the expiry when the loss side effects fail so the next run retries", async () => {
        mocks.subscriptionFindMany.mockResolvedValue([
            { id: "sub_1", userId: "user_1", organizationId: null, user: { email: "u@example.com" } },
        ])
        mocks.subscriptionUpdateMany.mockResolvedValue({ count: 1 })
        mocks.hasActivePersonalSubscription.mockResolvedValue(false)
        mocks.handlePersonalSubscriptionLoss.mockRejectedValue(new Error("db down"))

        const result = await expireLapsedCryptoSubscriptions()

        expect(mocks.subscriptionUpdateMany).toHaveBeenLastCalledWith({
            where: { id: "sub_1", status: "expired" },
            data: { status: "active" },
        })
        expect(result).toEqual({ expired: 0, downgraded: 0, errors: 1 })
    })
})
