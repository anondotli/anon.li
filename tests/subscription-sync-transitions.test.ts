/**
 * @vitest-environment node
 *
 * Missed-webhook sync paths apply the same loss / recovery side effects the
 * webhook would have, and crypto activation never supersedes a live Stripe
 * subscription.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import Stripe from "stripe"

const mocks = vi.hoisted(() => ({
    retrieve: vi.fn(),
    subscriptionFindMany: vi.fn(),
    subscriptionFindUnique: vi.fn(),
    subscriptionFindFirst: vi.fn(),
    subscriptionUpdateMany: vi.fn(),
    subscriptionUpsert: vi.fn(),
    userFindUnique: vi.fn(),
    userUpdateMany: vi.fn(),
    organizationUpdateMany: vi.fn(),
    handleLostSubscription: vi.fn(),
    handleRecoveredSubscription: vi.fn(),
}))

vi.mock("@/lib/stripe", () => ({ stripe: { subscriptions: { retrieve: mocks.retrieve } } }))
vi.mock("@/lib/prisma", () => ({
    prisma: {
        subscription: {
            findMany: mocks.subscriptionFindMany,
            findUnique: mocks.subscriptionFindUnique,
            findFirst: mocks.subscriptionFindFirst,
            updateMany: mocks.subscriptionUpdateMany,
            upsert: mocks.subscriptionUpsert,
        },
        user: { findUnique: mocks.userFindUnique, updateMany: mocks.userUpdateMany },
        organization: { updateMany: mocks.organizationUpdateMany },
    },
}))
vi.mock("@/lib/services/audit", () => ({ audit: vi.fn() }))
vi.mock("@/config/plans", () => ({
    getPlanFromPriceId: (id: string) => id === "price_alias_plus" ? { product: "alias", tier: "plus" } : null,
}))
vi.mock("@/lib/services/subscription-loss", () => ({
    LOST_STRIPE_STATUSES: new Set(["canceled", "incomplete_expired", "unpaid", "paused"]),
    handleLostSubscription: mocks.handleLostSubscription,
    handleRecoveredSubscription: mocks.handleRecoveredSubscription,
}))

import {
    createCryptoSubscription,
    findConflictingStripeSubscription,
    reconcileStaleStripeSubscriptions,
    syncSubscriptionFromStripe,
} from "@/lib/services/subscription-sync"
import type { Prisma } from "@prisma/client"

function stripeSub(status: string) {
    return {
        id: "sub_1",
        status,
        customer: "cus_1",
        cancel_at_period_end: false,
        metadata: {},
        items: { data: [{ price: { id: "price_alias_plus" }, current_period_end: Math.floor(Date.now() / 1000) + 86400 }] },
    }
}

const missing = () => new Stripe.errors.StripeInvalidRequestError({
    type: "invalid_request_error",
    code: "resource_missing",
    message: "No such subscription",
})

beforeEach(() => {
    vi.clearAllMocks()
    mocks.subscriptionUpdateMany.mockResolvedValue({ count: 1 })
    mocks.subscriptionUpsert.mockResolvedValue({})
    mocks.subscriptionFindUnique.mockResolvedValue({ seats: 1, organizationId: null })
    mocks.userUpdateMany.mockResolvedValue({ count: 0 })
    mocks.organizationUpdateMany.mockResolvedValue({ count: 0 })
    mocks.userFindUnique.mockResolvedValue({ id: "user_1", email: "u@example.com" })
})

describe("reconcileStaleStripeSubscriptions", () => {
    const staleRow = {
        providerSubscriptionId: "sub_1",
        organizationId: null,
        userId: "user_1",
        product: "alias",
        status: "active",
        lossNotifiedAt: null,
    }

    it("applies the loss effects of a missed terminal webhook", async () => {
        mocks.subscriptionFindMany.mockResolvedValue([staleRow])
        mocks.retrieve.mockResolvedValue(stripeSub("unpaid"))

        const result = await reconcileStaleStripeSubscriptions()

        expect(mocks.handleLostSubscription).toHaveBeenCalledWith("sub_1", {
            organizationId: null,
            user: { id: "user_1", email: "u@example.com" },
        })
        expect(result.revoked).toBe(1)
    })

    it("treats a subscription Stripe no longer has as lost", async () => {
        mocks.subscriptionFindMany.mockResolvedValue([{ ...staleRow, organizationId: "org_1", userId: null }])
        mocks.retrieve.mockRejectedValue(missing())

        await reconcileStaleStripeSubscriptions()

        expect(mocks.handleLostSubscription).toHaveBeenCalledWith("sub_1", { organizationId: "org_1", user: null })
    })

    it("does not start loss effects while Stripe is still retrying (past_due)", async () => {
        mocks.subscriptionFindMany.mockResolvedValue([staleRow])
        mocks.retrieve.mockResolvedValue(stripeSub("past_due"))

        await reconcileStaleStripeSubscriptions()

        expect(mocks.handleLostSubscription).not.toHaveBeenCalled()
        expect(mocks.handleRecoveredSubscription).not.toHaveBeenCalled()
    })

    it("also re-fetches past_due rows not synced for a few days, but never ownership-parked ones", async () => {
        mocks.subscriptionFindMany.mockResolvedValue([])

        await reconcileStaleStripeSubscriptions()

        const where = mocks.subscriptionFindMany.mock.calls[0]![0].where
        expect(where.OR).toContainEqual(expect.objectContaining({
            status: "past_due",
            updatedAt: { lt: expect.any(Date) },
            NOT: {
                OR: [
                    { product: "business", organizationId: null },
                    { product: { not: "business" }, organizationId: { not: null } },
                ],
            },
        }))
        const pastDueCutoff = where.OR[1].updatedAt.lt as Date
        expect(Date.now() - pastDueCutoff.getTime()).toBeGreaterThanOrEqual(3 * 86_400_000 - 1000)
    })

    it("heals a dunning row whose terminal webhook was missed", async () => {
        mocks.subscriptionFindMany.mockResolvedValue([{ ...staleRow, status: "past_due" }])
        mocks.retrieve.mockResolvedValue(stripeSub("canceled"))

        await reconcileStaleStripeSubscriptions()

        expect(mocks.subscriptionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ status: "canceled" }),
        }))
        expect(mocks.handleLostSubscription).toHaveBeenCalledWith("sub_1", expect.objectContaining({ organizationId: null }))
    })

    it("runs the recovery path when a dunning row is found active again", async () => {
        mocks.subscriptionFindMany.mockResolvedValue([{ ...staleRow, status: "past_due" }])
        mocks.retrieve.mockResolvedValue(stripeSub("active"))

        await reconcileStaleStripeSubscriptions()

        expect(mocks.handleRecoveredSubscription).toHaveBeenCalledWith(expect.objectContaining({ userId: "user_1" }))
    })

    it("refreshes a renewed row and clears its loss marker", async () => {
        mocks.subscriptionFindMany.mockResolvedValue([staleRow])
        mocks.retrieve.mockResolvedValue(stripeSub("active"))

        const result = await reconcileStaleStripeSubscriptions()

        expect(mocks.subscriptionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ status: "active", lossNotifiedAt: null }),
        }))
        expect(mocks.handleLostSubscription).not.toHaveBeenCalled()
        expect(result.refreshed).toBe(1)
    })
})

describe("syncSubscriptionFromStripe", () => {
    const row = (status: string, lossNotifiedAt: Date | null = null) => ({
        providerSubscriptionId: "sub_1",
        organizationId: null,
        product: "alias",
        status,
        lossNotifiedAt,
    })

    it("runs the recovery path when a lost row is active again", async () => {
        mocks.subscriptionFindMany.mockResolvedValue([row("past_due")])
        mocks.retrieve.mockResolvedValue(stripeSub("active"))

        await syncSubscriptionFromStripe("user_1")

        expect(mocks.handleRecoveredSubscription).toHaveBeenCalledWith({ organizationId: null, userId: "user_1" })
        expect(mocks.handleLostSubscription).not.toHaveBeenCalled()
    })

    it("applies the loss when an active row turns out terminally lost", async () => {
        mocks.subscriptionFindMany.mockResolvedValue([row("active")])
        mocks.retrieve.mockResolvedValue(stripeSub("canceled"))

        await syncSubscriptionFromStripe("user_1")

        expect(mocks.handleLostSubscription).toHaveBeenCalledWith("sub_1", {
            organizationId: null,
            user: { id: "user_1", email: "u@example.com" },
        })
    })

    it("does not re-run loss effects for a subscription that already ended", async () => {
        mocks.subscriptionFindMany.mockResolvedValue([row("canceled"), { ...row("past_due", new Date()), providerSubscriptionId: "sub_2" }])
        mocks.retrieve.mockResolvedValueOnce(stripeSub("canceled")).mockRejectedValueOnce(missing())

        await syncSubscriptionFromStripe("user_1")

        expect(mocks.handleLostSubscription).not.toHaveBeenCalled()
    })

    it("applies the loss for a dunning row whose Stripe subscription vanished", async () => {
        mocks.subscriptionFindMany.mockResolvedValue([row("past_due")])
        mocks.retrieve.mockRejectedValue(missing())

        await syncSubscriptionFromStripe("user_1")

        expect(mocks.handleLostSubscription).toHaveBeenCalledWith("sub_1", expect.objectContaining({ organizationId: null }))
    })
})

describe("crypto activation vs. Stripe subscriptions", () => {
    const tx = {
        subscription: {
            updateMany: mocks.subscriptionUpdateMany,
            upsert: mocks.subscriptionUpsert,
            findFirst: mocks.subscriptionFindFirst,
        },
    } as unknown as Prisma.TransactionClient

    it("only supersedes the user's other personal CRYPTO subscriptions", async () => {
        await createCryptoSubscription(tx, "user_1", "bundle", "plus", new Date(), new Date(), "ord_1", "price_x")

        expect(mocks.subscriptionUpdateMany).toHaveBeenCalledWith({
            where: {
                userId: "user_1",
                organizationId: null,
                provider: "crypto",
                status: "active",
                providerSubscriptionId: { not: "crypto_ord_1" },
            },
            data: { status: "expired" },
        })
    })

    it("detects a live or dunning personal Stripe subscription as a conflict", async () => {
        mocks.subscriptionFindFirst.mockResolvedValue({ id: "row_1", status: "past_due" })

        await expect(findConflictingStripeSubscription(tx, "user_1")).resolves.toEqual({ id: "row_1", status: "past_due" })
        expect(mocks.subscriptionFindFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                userId: "user_1",
                organizationId: null,
                provider: "stripe",
                OR: expect.arrayContaining([{
                    provider: "stripe",
                    status: "past_due",
                    lossNotifiedAt: null,
                    updatedAt: { gt: expect.any(Date) },
                }]),
            }),
        }))
    })
})
