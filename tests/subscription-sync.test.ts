/**
 * @vitest-environment node
 *
 * mapStripeStatus is the single point that translates Stripe's subscription
 * lifecycle into our access-granting status. A wrong mapping silently grants or
 * revokes paid access, so the full table is pinned here.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import type Stripe from "stripe"

const {
    mockSubscriptionFindUnique,
    mockSubscriptionUpdateMany,
    mockOrganizationUpdateMany,
    mockUserUpdateMany,
} = vi.hoisted(() => ({
    mockSubscriptionFindUnique: vi.fn(),
    mockSubscriptionUpdateMany: vi.fn(),
    mockOrganizationUpdateMany: vi.fn(),
    mockUserUpdateMany: vi.fn(),
}))

// Module-level imports pull in the Stripe client + prisma; stub them so importing
// the unit under test doesn't require live credentials.
vi.mock("@/lib/stripe", () => ({ stripe: {} }))
vi.mock("@/lib/prisma", () => ({
    prisma: {
        subscription: {
            findUnique: mockSubscriptionFindUnique,
            updateMany: mockSubscriptionUpdateMany,
        },
        organization: { updateMany: mockOrganizationUpdateMany },
        user: { updateMany: mockUserUpdateMany },
    },
}))
vi.mock("@/lib/services/audit", () => ({ audit: vi.fn() }))

import { mapStripeStatus, markSubscriptionCanceledLocally } from "@/lib/services/subscription-sync"

describe("mapStripeStatus", () => {
    const cases: Array<[Stripe.Subscription.Status, string]> = [
        ["active", "active"],
        ["trialing", "trialing"],
        ["canceled", "canceled"],
        ["incomplete_expired", "canceled"],
        ["past_due", "past_due"],
        ["unpaid", "past_due"],
        ["incomplete", "past_due"],
        ["paused", "past_due"],
    ]

    it.each(cases)("maps Stripe %s -> %s", (input, expected) => {
        expect(mapStripeStatus(input)).toBe(expected)
    })

    it("falls back to canceled for unrecognized statuses", () => {
        expect(mapStripeStatus("some_future_status" as Stripe.Subscription.Status)).toBe("canceled")
    })
})

describe("markSubscriptionCanceledLocally", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockSubscriptionUpdateMany.mockResolvedValue({ count: 1 })
    })

    it("cancels the row and establishes the personal Form retention grace", async () => {
        mockSubscriptionFindUnique.mockResolvedValue({
            organizationId: null,
            userId: "user_1",
            product: "form",
        })

        await markSubscriptionCanceledLocally("sub_x")

        expect(mockSubscriptionUpdateMany).toHaveBeenCalledWith({
            where: { providerSubscriptionId: "sub_x" },
            data: { status: "canceled", cancelAtPeriodEnd: false },
        })
        expect(mockUserUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ id: "user_1", downgradedAt: null }),
            data: { downgradedAt: expect.any(Date) },
        }))
    })

    it("cancels the row and establishes the org Form retention grace", async () => {
        mockSubscriptionFindUnique.mockResolvedValue({
            organizationId: "org_1",
            userId: null,
            product: "business",
        })

        await markSubscriptionCanceledLocally("sub_y")

        expect(mockSubscriptionUpdateMany).toHaveBeenCalledWith({
            where: { providerSubscriptionId: "sub_y" },
            data: { status: "canceled", cancelAtPeriodEnd: false },
        })
        expect(mockOrganizationUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ id: "org_1" }),
            data: { formRetentionGraceUntil: expect.any(Date) },
        }))
        expect(mockUserUpdateMany).not.toHaveBeenCalled()
    })

    it("is a no-op when the row does not exist", async () => {
        mockSubscriptionFindUnique.mockResolvedValue(null)

        await markSubscriptionCanceledLocally("sub_missing")

        expect(mockSubscriptionUpdateMany).not.toHaveBeenCalled()
        expect(mockUserUpdateMany).not.toHaveBeenCalled()
        expect(mockOrganizationUpdateMany).not.toHaveBeenCalled()
    })
})
