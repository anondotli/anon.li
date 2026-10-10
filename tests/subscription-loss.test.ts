/**
 * Shared terminal-loss handling: first signal notifies, repeats only reapply
 * idempotent effects, and users keeping another subscription are untouched.
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const mocks = vi.hoisted(() => ({
    subscriptionCount: vi.fn(),
    claim: vi.fn(),
    handlePersonalSubscriptionLoss: vi.fn(),
    cancelDowngrade: vi.fn(),
    handleOrgSubscriptionLoss: vi.fn(),
    restoreOrgDropGrace: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({ prisma: { subscription: { count: mocks.subscriptionCount } } }))
vi.mock("@/lib/services/subscription-sync", () => ({ claimSubscriptionLossNotification: mocks.claim }))
vi.mock("@/lib/services/billing-downgrade", () => ({
    BillingDowngradeService: {
        handlePersonalSubscriptionLoss: mocks.handlePersonalSubscriptionLoss,
        cancelDowngrade: mocks.cancelDowngrade,
    },
}))
vi.mock("@/lib/services/org-billing", () => ({
    handleOrgSubscriptionLoss: mocks.handleOrgSubscriptionLoss,
    restoreOrgDropGrace: mocks.restoreOrgDropGrace,
}))

import {
    handleLostSubscription,
    handleRecoveredSubscription,
    LOST_STRIPE_STATUSES,
} from "@/lib/services/subscription-loss"

const user = { id: "user_1", email: "u@example.com" }

describe("handleLostSubscription", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.subscriptionCount.mockResolvedValue(0)
        mocks.claim.mockResolvedValue(true)
    })

    it("treats only non-recovering Stripe states as terminal", () => {
        expect([...LOST_STRIPE_STATUSES].sort()).toEqual(["canceled", "incomplete_expired", "paused", "unpaid"])
        expect(LOST_STRIPE_STATUSES.has("past_due")).toBe(false)
        expect(LOST_STRIPE_STATUSES.has("incomplete")).toBe(false)
    })

    it("notifies on the first signal and not on repeats", async () => {
        await handleLostSubscription("sub_1", { organizationId: null, user })
        mocks.claim.mockResolvedValueOnce(false)
        await handleLostSubscription("sub_1", { organizationId: null, user })

        expect(mocks.handlePersonalSubscriptionLoss).toHaveBeenNthCalledWith(1, "user_1", "u@example.com", { notify: true })
        expect(mocks.handlePersonalSubscriptionLoss).toHaveBeenNthCalledWith(2, "user_1", "u@example.com", { notify: false })
    })

    it("leaves a user with another active personal subscription untouched", async () => {
        mocks.subscriptionCount.mockResolvedValue(1)

        await handleLostSubscription("sub_1", { organizationId: null, user })

        expect(mocks.claim).not.toHaveBeenCalled()
        expect(mocks.handlePersonalSubscriptionLoss).not.toHaveBeenCalled()
    })

    it("routes org subscriptions to the org loss flow", async () => {
        mocks.claim.mockResolvedValueOnce(false)

        await handleLostSubscription("sub_org", { organizationId: "org_1", user: null })

        expect(mocks.handleOrgSubscriptionLoss).toHaveBeenCalledWith("org_1", expect.any(Date), { notify: false })
        expect(mocks.handlePersonalSubscriptionLoss).not.toHaveBeenCalled()
    })
})

describe("handleRecoveredSubscription", () => {
    beforeEach(() => vi.clearAllMocks())

    it("cancels the personal downgrade", async () => {
        await handleRecoveredSubscription({ organizationId: null, userId: "user_1" })
        expect(mocks.cancelDowngrade).toHaveBeenCalledWith("user_1")
        expect(mocks.restoreOrgDropGrace).not.toHaveBeenCalled()
    })

    it("restores org drops", async () => {
        await handleRecoveredSubscription({ organizationId: "org_1", userId: "user_1" })
        expect(mocks.restoreOrgDropGrace).toHaveBeenCalledWith("org_1")
        expect(mocks.cancelDowngrade).not.toHaveBeenCalled()
    })
})
