/**
 * @vitest-environment node
 *
 * Org RBAC gate (assertCanManage) + org-wide 2FA policy predicates. These are
 * the enforcement primitives behind "members can't delete org resources" and
 * "a team can require 2FA".
 */
import { describe, expect, it } from "vitest"

import { assertCanManage, personalScope, orgScope } from "@/lib/ownership"
import { ForbiddenError, NotFoundError } from "@/lib/api-error-utils"
import { orgRequiresTwoFactorSetup, orgTwoFactorBlock, requiresTwoFactorChallenge } from "@/lib/access-policy"

const orgRow = { userId: "creator", organizationId: "org-1" }
const personalRow = { userId: "owner", organizationId: null }

describe("assertCanManage — org RBAC for destructive ops", () => {
    it("allows a personal owner to manage their own resource (no role gate)", () => {
        expect(() => assertCanManage(personalRow, personalScope("owner"))).not.toThrow()
    })

    it("blocks a plain member from managing an org resource", () => {
        expect(() => assertCanManage(orgRow, orgScope("m", "org-1", "member"))).toThrow(ForbiddenError)
    })

    it("allows an org admin and owner to manage an org resource", () => {
        expect(() => assertCanManage(orgRow, orgScope("a", "org-1", "admin"))).not.toThrow()
        expect(() => assertCanManage(orgRow, orgScope("o", "org-1", "owner"))).not.toThrow()
    })

    it("404s an out-of-tenant resource (don't leak existence) regardless of role", () => {
        expect(() => assertCanManage(orgRow, orgScope("x", "org-2", "owner"))).toThrow(NotFoundError)
        expect(() => assertCanManage(orgRow, personalScope("creator"))).toThrow(NotFoundError)
    })

    it("honors a custom minRole (owner-only ops)", () => {
        expect(() => assertCanManage(orgRow, orgScope("a", "org-1", "admin"), "owner")).toThrow(ForbiddenError)
        expect(() => assertCanManage(orgRow, orgScope("o", "org-1", "owner"), "owner")).not.toThrow()
    })
})

describe("org-wide 2FA policy", () => {
    const state = (over: Partial<{ enabled: boolean; verified: boolean; enforce: boolean }> = {}) => ({
        user: { twoFactorEnabled: over.enabled ?? false },
        twoFactorVerified: over.verified ?? false,
        activeOrgEnforce2FA: over.enforce ?? false,
    })

    it("orgRequiresTwoFactorSetup: true only when org enforces and user has no 2FA", () => {
        expect(orgRequiresTwoFactorSetup(state({ enforce: true, enabled: false }))).toBe(true)
        expect(orgRequiresTwoFactorSetup(state({ enforce: true, enabled: true }))).toBe(false)
        expect(orgRequiresTwoFactorSetup(state({ enforce: false, enabled: false }))).toBe(false)
    })

    it("orgTwoFactorBlock distinguishes setup vs challenge under enforcement", () => {
        expect(orgTwoFactorBlock(state({ enforce: true, enabled: false }))).toBe("setup-required")
        expect(orgTwoFactorBlock(state({ enforce: true, enabled: true, verified: false }))).toBe("challenge-required")
        expect(orgTwoFactorBlock(state({ enforce: true, enabled: true, verified: true }))).toBeNull()
    })

    it("orgTwoFactorBlock falls back to the standard challenge gate when not enforcing", () => {
        // Enrolled-but-unverified is still challenged outside org enforcement.
        expect(orgTwoFactorBlock(state({ enforce: false, enabled: true, verified: false }))).toBe("challenge-required")
        // Not enrolled + no enforcement → no block.
        expect(orgTwoFactorBlock(state({ enforce: false, enabled: false }))).toBeNull()
        // Consistency with the base predicate.
        expect(requiresTwoFactorChallenge(state({ enabled: true, verified: false }))).toBe(true)
    })
})
