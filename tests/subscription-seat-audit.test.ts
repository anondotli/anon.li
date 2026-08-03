/**
 * @vitest-environment node
 *
 * Track H audit: upsertStripeSubscription records org.billing.seats_change ONLY
 * when an org subscription's seat count actually changes — not on create, not on
 * no-op updates, and never for personal subscriptions. (The existing row is
 * pre-read for all subs now, to resolve seats/org from the canonical column.)
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const { prisma, audit, getPlanFromPriceId, retrieveSubscription } = vi.hoisted(() => ({
    prisma: {
        subscription: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            upsert: vi.fn(),
            updateMany: vi.fn(),
        },
        organization: { updateMany: vi.fn() },
        user: { updateMany: vi.fn() },
    },
    audit: vi.fn(),
    getPlanFromPriceId: vi.fn(),
    retrieveSubscription: vi.fn(),
}))

vi.mock("stripe", () => ({ default: class Stripe {} }))
vi.mock("@/lib/stripe", () => ({ stripe: { subscriptions: { retrieve: retrieveSubscription } } }))
vi.mock("@/lib/prisma", () => ({ prisma }))
vi.mock("@/lib/services/audit", () => ({ audit }))
vi.mock("@/config/plans", () => ({ getPlanFromPriceId }))
vi.mock("@/lib/logger", () => ({
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import {
    reconcileStaleStripeSubscriptions,
    upsertStripeSubscription,
} from "@/lib/services/subscription-sync"

type SubArg = Parameters<typeof upsertStripeSubscription>[1]

function makeSub({
    seats = 5,
    organizationId = "org-9" as string | null,
    status = "active" as SubArg["status"],
} = {}): SubArg {
    return {
        id: "sub_123",
        customer: "cus_123",
        status,
        cancel_at_period_end: false,
        current_period_end: 1800000000,
        metadata: organizationId ? { organizationId } : {},
        items: {
            data: [
                {
                    price: { id: "price_business" },
                    quantity: seats,
                    current_period_start: 1790000000,
                    current_period_end: 1800000000,
                },
            ],
        },
    } as unknown as SubArg
}

beforeEach(() => {
    vi.clearAllMocks()
    getPlanFromPriceId.mockReturnValue({ product: "business", tier: "pro" })
    prisma.subscription.upsert.mockResolvedValue({})
    prisma.organization.updateMany.mockResolvedValue({ count: 1 })
    prisma.user.updateMany.mockResolvedValue({ count: 1 })
})

describe("upsertStripeSubscription — seat-change audit", () => {
    it("audits when an org sub's seats change", async () => {
        prisma.subscription.findUnique.mockResolvedValue({ seats: 3, organizationId: "org-9" })
        await upsertStripeSubscription("owner-1", makeSub({ seats: 5 }))
        expect(audit).toHaveBeenCalledWith({
            action: "org.billing.seats_change",
            actorId: "owner-1",
            targetId: "sub_123",
            organizationId: "org-9",
            metadata: { from: 3, to: 5 },
        })
    })

    it("keeps canonical organization ownership when Stripe metadata conflicts", async () => {
        prisma.subscription.findUnique.mockResolvedValue({ seats: 3, organizationId: "org-canonical" })

        await upsertStripeSubscription("owner-1", makeSub({ seats: 5, organizationId: "org-metadata" }))

        expect(prisma.subscription.upsert).toHaveBeenCalledWith(expect.objectContaining({
            update: expect.objectContaining({ organizationId: "org-canonical" }),
        }))
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({
            organizationId: "org-canonical",
        }))
    })

    it("uses the system actor when the org subscription buyer was deleted", async () => {
        prisma.subscription.findUnique.mockResolvedValue({ seats: 3, organizationId: "org-9" })
        await upsertStripeSubscription(null, makeSub({ seats: 5, organizationId: null }))
        expect(audit).toHaveBeenCalledWith({
            action: "org.billing.seats_change",
            actorId: "system",
            targetId: "sub_123",
            organizationId: "org-9",
            metadata: { from: 3, to: 5 },
        })
    })

    it("does NOT audit when seats are unchanged", async () => {
        prisma.subscription.findUnique.mockResolvedValue({ seats: 5, organizationId: "org-9" })
        await upsertStripeSubscription("owner-1", makeSub({ seats: 5 }))
        expect(audit).not.toHaveBeenCalled()
    })

    it("does NOT audit on first creation (no prior subscription)", async () => {
        prisma.subscription.findUnique.mockResolvedValue(null)
        await upsertStripeSubscription("owner-1", makeSub({ seats: 5 }))
        expect(audit).not.toHaveBeenCalled()
    })

    it("does NOT audit for a personal subscription", async () => {
        getPlanFromPriceId.mockReturnValue({ product: "bundle", tier: "pro" })
        prisma.subscription.findUnique.mockResolvedValue(null)
        await upsertStripeSubscription("user-1", makeSub({ seats: 1, organizationId: null }))
        expect(audit).not.toHaveBeenCalled()
    })

    it("rejects a Business subscription without organization ownership", async () => {
        prisma.subscription.findUnique.mockResolvedValue(null)

        await expect(upsertStripeSubscription(
            "user-1",
            makeSub({ seats: 1, organizationId: null }),
        )).rejects.toThrow("Business subscriptions require organization ownership")

        expect(prisma.subscription.upsert).not.toHaveBeenCalled()
        expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
            where: { providerSubscriptionId: "sub_123" },
            data: { status: "past_due" },
        })
    })

    it("rejects a personal product attached to an organization", async () => {
        getPlanFromPriceId.mockReturnValue({ product: "bundle", tier: "pro" })
        prisma.subscription.findUnique.mockResolvedValue(null)

        await expect(upsertStripeSubscription(
            "user-1",
            makeSub({ organizationId: "org-9" }),
        )).rejects.toThrow("bundle subscriptions cannot be organization-owned")

        expect(prisma.subscription.upsert).not.toHaveBeenCalled()
    })

    it("records personal Form retention grace on an inactive sync", async () => {
        getPlanFromPriceId.mockReturnValue({ product: "bundle", tier: "pro" })
        prisma.subscription.findUnique.mockResolvedValue(null)

        await upsertStripeSubscription(
            "user-1",
            makeSub({ seats: 1, organizationId: null, status: "past_due" }),
        )

        expect(prisma.user.updateMany).toHaveBeenCalledWith({
            where: {
                id: "user-1",
                downgradedAt: null,
                subscriptions: {
                    none: {
                        organizationId: null,
                        product: { in: ["form", "bundle", "business"] },
                        status: { in: ["active", "trialing"] },
                    },
                },
            },
            data: { downgradedAt: expect.any(Date) },
        })
    })

    it("establishes Form retention grace when an org subscription becomes inactive", async () => {
        prisma.subscription.findUnique.mockResolvedValue({ seats: 5, organizationId: "org-9" })

        await upsertStripeSubscription("owner-1", makeSub({ status: "past_due" }))

        expect(prisma.organization.updateMany).toHaveBeenCalledWith({
            where: {
                id: "org-9",
                formRetentionGraceUntil: null,
                subscriptions: {
                    none: {
                        product: { in: ["form", "bundle", "business"] },
                        status: { in: ["active", "trialing"] },
                    },
                },
            },
            data: { formRetentionGraceUntil: expect.any(Date) },
        })
    })

    it("establishes grace during missed-webhook reconciliation", async () => {
        prisma.subscription.findMany.mockResolvedValue([{
            providerSubscriptionId: "sub_123",
            organizationId: "org-9",
            userId: null,
            product: "business",
        }])
        prisma.subscription.updateMany.mockResolvedValue({ count: 1 })
        retrieveSubscription.mockResolvedValue(makeSub({ status: "past_due" }))

        await expect(reconcileStaleStripeSubscriptions()).resolves.toEqual({
            checked: 1,
            revoked: 1,
            refreshed: 0,
            errors: 0,
        })
        expect(prisma.organization.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({ data: { formRetentionGraceUntil: expect.any(Date) } }),
        )
    })
})
