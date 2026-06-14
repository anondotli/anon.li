/**
 * @vitest-environment node
 *
 * Track H audit: upsertStripeSubscription records org.billing.seats_change ONLY
 * when an org subscription's seat count actually changes — not on create, not on
 * no-op updates, and never for personal subscriptions. (The existing row is
 * pre-read for all subs now, to resolve seats/org from the canonical column.)
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const { prisma, audit, getPlanFromPriceId } = vi.hoisted(() => ({
    prisma: { subscription: { findUnique: vi.fn(), upsert: vi.fn() } },
    audit: vi.fn(),
    getPlanFromPriceId: vi.fn(),
}))

vi.mock("stripe", () => ({ default: class Stripe {} }))
vi.mock("@/lib/stripe", () => ({ stripe: {} }))
vi.mock("@/lib/prisma", () => ({ prisma }))
vi.mock("@/lib/services/audit", () => ({ audit }))
vi.mock("@/config/plans", () => ({ getPlanFromPriceId }))
vi.mock("@/lib/logger", () => ({
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { upsertStripeSubscription } from "@/lib/services/subscription-sync"

type SubArg = Parameters<typeof upsertStripeSubscription>[1]

function makeSub({ seats = 5, organizationId = "org-9" as string | null } = {}): SubArg {
    return {
        id: "sub_123",
        customer: "cus_123",
        status: "active",
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
})

describe("upsertStripeSubscription — seat-change audit", () => {
    it("audits when an org sub's seats change", async () => {
        prisma.subscription.findUnique.mockResolvedValue({ seats: 3 })
        await upsertStripeSubscription("owner-1", makeSub({ seats: 5 }))
        expect(audit).toHaveBeenCalledWith({
            action: "org.billing.seats_change",
            actorId: "owner-1",
            targetId: "sub_123",
            organizationId: "org-9",
            metadata: { from: 3, to: 5 },
        })
    })

    it("does NOT audit when seats are unchanged", async () => {
        prisma.subscription.findUnique.mockResolvedValue({ seats: 5 })
        await upsertStripeSubscription("owner-1", makeSub({ seats: 5 }))
        expect(audit).not.toHaveBeenCalled()
    })

    it("does NOT audit on first creation (no prior subscription)", async () => {
        prisma.subscription.findUnique.mockResolvedValue(null)
        await upsertStripeSubscription("owner-1", makeSub({ seats: 5 }))
        expect(audit).not.toHaveBeenCalled()
    })

    it("does NOT audit for a personal subscription", async () => {
        prisma.subscription.findUnique.mockResolvedValue(null)
        await upsertStripeSubscription("user-1", makeSub({ seats: 1, organizationId: null }))
        expect(audit).not.toHaveBeenCalled()
    })
})
