/**
 * @vitest-environment node
 *
 * Organization lifecycle hooks (wired into better-auth organizationHooks in
 * lib/auth.ts): invitation seat reservation, billing-first team deletion, and
 * awaited member-access revocation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { APIError } from "@better-auth/core/error"

const h = vi.hoisted(() => ({
    getOrgSeatUsage: vi.fn(),
    revokeOrganizationMemberAccess: vi.fn(),
    cancelOrganizationStripeSubscriptions: vi.fn(),
    eraseOrgDrops: vi.fn(),
    order: [] as string[],
}))

vi.mock("server-only", () => ({}))
vi.mock("@/lib/org-seats", () => ({ getOrgSeatUsage: h.getOrgSeatUsage }))
vi.mock("@/lib/auth-hooks", () => ({ revokeOrganizationMemberAccess: h.revokeOrganizationMemberAccess }))
vi.mock("@/lib/services/deletion", () => ({
    DeletionService: { cancelOrganizationStripeSubscriptions: h.cancelOrganizationStripeSubscriptions },
}))
vi.mock("@/lib/services/erasure", () => ({ eraseOrgDrops: h.eraseOrgDrops }))
vi.mock("@/lib/logger", () => ({
    createLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}))

import {
    assertInvitationSeatAvailable,
    prepareOrganizationDeletion,
    revokeRemovedMemberAccess,
} from "@/lib/org-lifecycle"

beforeEach(() => {
    vi.clearAllMocks()
    h.order.length = 0
    h.cancelOrganizationStripeSubscriptions.mockImplementation(async () => { h.order.push("cancel") })
    h.eraseOrgDrops.mockImplementation(async () => { h.order.push("erase") })
})

describe("assertInvitationSeatAvailable", () => {
    it("allows an invitation while a seat is free", async () => {
        h.getOrgSeatUsage.mockResolvedValue({ limit: 5, members: 3, pendingInvitations: 1 })
        await expect(assertInvitationSeatAvailable("org-1")).resolves.toBeUndefined()
    })

    it("counts pending invitations against the paid seats", async () => {
        h.getOrgSeatUsage.mockResolvedValue({ limit: 5, members: 3, pendingInvitations: 2 })
        const error = await assertInvitationSeatAvailable("org-1").catch((e: unknown) => e)
        expect(error).toBeInstanceOf(APIError)
        expect((error as APIError & { body?: { code?: string } }).body?.code).toBe("ORG_SEAT_LIMIT_REACHED")
        expect((error as Error).message).toMatch(/pending invitations/)
    })

    it("rejects inviting into a free (unsubscribed) team that holds only its owner", async () => {
        h.getOrgSeatUsage.mockResolvedValue({ limit: 1, members: 1, pendingInvitations: 0 })
        await expect(assertInvitationSeatAvailable("org-1")).rejects.toBeInstanceOf(APIError)
    })
})

describe("prepareOrganizationDeletion", () => {
    it("cancels the team's Stripe subscriptions before erasing drops", async () => {
        await prepareOrganizationDeletion("org-1")
        expect(h.cancelOrganizationStripeSubscriptions).toHaveBeenCalledWith("org-1")
        expect(h.order).toEqual(["cancel", "erase"])
    })

    it("fails the delete (and touches nothing) when cancellation can't be confirmed", async () => {
        h.cancelOrganizationStripeSubscriptions.mockRejectedValue(new Error("Couldn't cancel the organization's active Stripe subscription"))
        const error = await prepareOrganizationDeletion("org-1").catch((e: unknown) => e)
        expect(error).toBeInstanceOf(APIError)
        expect((error as Error).message).toMatch(/Couldn't cancel/)
        expect(h.eraseOrgDrops).not.toHaveBeenCalled()
    })

    it("never blocks deletion on storage erasure", async () => {
        h.eraseOrgDrops.mockRejectedValue(new Error("R2 down"))
        await expect(prepareOrganizationDeletion("org-1")).resolves.toBeUndefined()
    })
})

describe("revokeRemovedMemberAccess", () => {
    it("awaits the revocation before resolving", async () => {
        let finished = false
        h.revokeOrganizationMemberAccess.mockImplementation(async () => {
            await new Promise((r) => setTimeout(r, 5))
            finished = true
        })
        await revokeRemovedMemberAccess("org-1", "user-2")
        expect(finished).toBe(true)
        expect(h.revokeOrganizationMemberAccess).toHaveBeenCalledWith("org-1", "user-2")
    })

    it("logs instead of throwing when revocation fails", async () => {
        h.revokeOrganizationMemberAccess.mockRejectedValue(new Error("db down"))
        await expect(revokeRemovedMemberAccess("org-1", "user-2")).resolves.toBeUndefined()
    })
})
