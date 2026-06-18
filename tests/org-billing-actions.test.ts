/**
 * @vitest-environment node
 *
 * Owner-only org billing actions (updateOrgSeats / createOrgPortalSession /
 * createTeamCheckoutSession). These run through the real runScopedAction wrapper
 * (so the minRole:"owner" gate and the seats>=memberCount invariant are exercised
 * end-to-end), with auth/prisma/stripe mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const { auth, getAuthUserState, getOrganizationSuspension, rateLimit, prisma, stripe, redirect } = vi.hoisted(() => ({
    auth: vi.fn(),
    getAuthUserState: vi.fn(),
    getOrganizationSuspension: vi.fn(),
    rateLimit: vi.fn(),
    prisma: {
        member: { count: vi.fn() },
        subscription: { findFirst: vi.fn() },
    },
    stripe: {
        subscriptions: { retrieve: vi.fn(), update: vi.fn() },
        billingPortal: { sessions: { create: vi.fn() } },
        checkout: { sessions: { create: vi.fn() } },
    },
    redirect: vi.fn(),
}))

vi.mock("@/auth", () => ({ auth }))
vi.mock("@/lib/data/auth", () => ({ getAuthUserState, getOrganizationSuspension }))
vi.mock("@/lib/rate-limit", () => ({ rateLimit, rateLimiters: {} }))
vi.mock("@/lib/prisma", () => ({ prisma }))
vi.mock("@/lib/stripe", () => ({ stripe }))
vi.mock("next/navigation", () => ({ redirect }))
vi.mock("@/lib/logger", () => ({
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
    logError: vi.fn(),
}))
vi.mock("@/lib/access-policy", () => ({
    requiresTwoFactorChallenge: () => false,
    orgRequiresTwoFactorSetup: () => false,
}))
vi.mock("@/config/plans", () => ({
    BUSINESS_PLAN: { priceIds: { monthly: "price_month", yearly: "price_year" } },
}))

import { updateOrgSeats, createOrgPortalSession } from "@/actions/manage-org-billing"
import { createTeamCheckoutSession } from "@/actions/create-team-checkout"

function setSession(role: string | null = "owner", email = "owner@example.com") {
    auth.mockResolvedValue({
        user: { id: "u1", email },
        activeOrganizationId: role ? "org1" : null,
        activeOrgRole: role,
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    getAuthUserState.mockResolvedValue({ banned: false })
    getOrganizationSuspension.mockResolvedValue({ suspended: false, reason: null })
    rateLimit.mockResolvedValue(null)
})

describe("updateOrgSeats", () => {
    it("updates the Stripe quantity for an owner when seats >= member count", async () => {
        setSession("owner")
        prisma.member.count.mockResolvedValue(3)
        prisma.subscription.findFirst.mockResolvedValue({ providerSubscriptionId: "sub1", providerCustomerId: "cus1" })
        stripe.subscriptions.retrieve.mockResolvedValue({ items: { data: [{ id: "item1" }] } })
        stripe.subscriptions.update.mockResolvedValue({})

        const result = await updateOrgSeats({ seats: 5 })

        expect(result).toEqual({ success: true, data: { seats: 5 } })
        expect(stripe.subscriptions.update).toHaveBeenCalledWith(
            "sub1",
            expect.objectContaining({ items: [{ id: "item1", quantity: 5 }] }),
        )
    })

    it("rejects reducing seats below the current member count", async () => {
        setSession("owner")
        prisma.member.count.mockResolvedValue(5)

        const result = await updateOrgSeats({ seats: 2 })

        expect(result.error).toMatch(/5 members/)
        expect(stripe.subscriptions.update).not.toHaveBeenCalled()
    })

    it("blocks a non-owner via the minRole gate", async () => {
        setSession("admin")

        const result = await updateOrgSeats({ seats: 5 })

        expect(result.error).toBe("Insufficient organization role")
        expect(prisma.member.count).not.toHaveBeenCalled()
        expect(stripe.subscriptions.update).not.toHaveBeenCalled()
    })

    it("rejects a personal-context call (no active org)", async () => {
        setSession(null)

        const result = await updateOrgSeats({ seats: 5 })

        expect(result.error).toBe("No active organization")
        expect(stripe.subscriptions.update).not.toHaveBeenCalled()
    })
})

describe("createOrgPortalSession", () => {
    it("redirects an owner to the org's Stripe portal", async () => {
        setSession("owner")
        prisma.subscription.findFirst.mockResolvedValue({ providerSubscriptionId: "sub1", providerCustomerId: "cus1" })
        stripe.billingPortal.sessions.create.mockResolvedValue({ url: "https://portal.example/x" })

        await createOrgPortalSession()

        expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith(
            expect.objectContaining({ customer: "cus1" }),
        )
        expect(redirect).toHaveBeenCalledWith("https://portal.example/x")
    })

    it("errors (no redirect) when the org has no active subscription", async () => {
        setSession("owner")
        prisma.subscription.findFirst.mockResolvedValue(null)

        const result = await createOrgPortalSession()

        expect(result?.error).toMatch(/No active team subscription/)
        expect(redirect).not.toHaveBeenCalled()
    })
})

describe("createTeamCheckoutSession", () => {
    it("starts checkout with at least the current member count of seats", async () => {
        setSession("owner")
        prisma.subscription.findFirst.mockResolvedValue(null)
        prisma.member.count.mockResolvedValue(4)
        stripe.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.example/y" })

        await createTeamCheckoutSession({ frequency: "monthly", seats: 2 })

        // requested 2 but 4 members → clamped up to 4 so no member is left unpaid.
        expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
            expect.objectContaining({ line_items: [{ price: "price_month", quantity: 4 }] }),
        )
        expect(redirect).toHaveBeenCalledWith("https://checkout.example/y")
    })

    it("refuses a second active subscription for the org", async () => {
        setSession("owner")
        prisma.subscription.findFirst.mockResolvedValue({ id: "existing" })

        const result = await createTeamCheckoutSession({ frequency: "monthly" })

        expect(result?.error).toMatch(/already has an active subscription/)
        expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
    })
})
