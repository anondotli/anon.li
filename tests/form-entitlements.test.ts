/**
 * @vitest-environment node
 *
 * Org-owned forms must derive entitlements from the ORGANIZATION's plan, not the
 * creating user — otherwise they silently degrade to free caps / 0-day retention
 * when the creator leaves or is deleted. Personal forms resolve from the user.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const { getOrgLimitContext, getEffectiveTier, getEffectiveTiers } = vi.hoisted(() => ({
    getOrgLimitContext: vi.fn(),
    getEffectiveTier: vi.fn(),
    getEffectiveTiers: vi.fn(),
}))

vi.mock("server-only", () => ({}))
vi.mock("@/lib/data/auth", () => ({ getOrgLimitContext }))
vi.mock("@/lib/limits", () => ({ getEffectiveTier }))
vi.mock("@/lib/entitlements", () => ({ getEffectiveTiers }))

import { getFormOwnerEntitlements } from "@/lib/services/form-entitlements"
import { PLAN_ENTITLEMENTS } from "@/config/plans"

beforeEach(() => vi.clearAllMocks())

describe("getFormOwnerEntitlements", () => {
    it("resolves an org form from the org plan (even with a null creator)", async () => {
        getOrgLimitContext.mockResolvedValue({ subscriptions: [{ product: "business", tier: "pro", status: "active" }], referralPlusUntil: null })
        getEffectiveTier.mockReturnValue("pro")

        const result = await getFormOwnerEntitlements({ userId: null, organizationId: "org-1" })

        expect(getOrgLimitContext).toHaveBeenCalledWith("org-1")
        expect(getEffectiveTiers).not.toHaveBeenCalled()
        expect(result.tiers).toEqual({ form: "pro", drop: "pro" })
        expect(result.limits).toBe(PLAN_ENTITLEMENTS.form.pro)
        // Pro retention is non-zero — the cleanup-purge bug can't recur.
        expect(result.limits.retentionDays).toBeGreaterThan(0)
        // A subscribed org is an unlocked workspace.
        expect(result.subscribed).toBe(true)
    })

    it("marks an org with no active subscription as not subscribed (purchase-first gate)", async () => {
        getOrgLimitContext.mockResolvedValue({ subscriptions: [], referralPlusUntil: null })
        getEffectiveTier.mockReturnValue("free")

        const result = await getFormOwnerEntitlements({ userId: "user-1", organizationId: "org-1" })

        expect(result.subscribed).toBe(false)
    })

    it("resolves a personal form from the user's per-product tiers", async () => {
        getEffectiveTiers.mockResolvedValue({ alias: "free", drop: "free", form: "plus" })

        const result = await getFormOwnerEntitlements({ userId: "user-1", organizationId: null })

        expect(getEffectiveTiers).toHaveBeenCalledWith("user-1")
        expect(getOrgLimitContext).not.toHaveBeenCalled()
        expect(result.tiers).toEqual({ form: "plus", drop: "free" })
        expect(result.limits).toBe(PLAN_ENTITLEMENTS.form.plus)
        // Personal owners are always "subscribed" — free personal accounts keep
        // their own caps; only orgs are gated by purchase-first.
        expect(result.subscribed).toBe(true)
    })
})
