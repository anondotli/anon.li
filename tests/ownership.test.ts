import { describe, it, expect } from "vitest"
import {
    personalScope,
    orgScope,
    isOrgScope,
    ownerWhere,
    assertCanAccess,
    type Ownable,
} from "@/lib/ownership"
import { ForbiddenError, NotFoundError } from "@/lib/api-error-utils"

const USER_A = "user-a"
const USER_B = "user-b"
const ORG_A = "org-a"
const ORG_B = "org-b"

// Resource fixtures
const personalResourceA: Ownable = { userId: USER_A, organizationId: null }
const personalResourceB: Ownable = { userId: USER_B, organizationId: null }
const orgResourceA: Ownable = { userId: USER_A, organizationId: ORG_A }
const orgResourceB: Ownable = { userId: USER_B, organizationId: ORG_B }

describe("ownership scope constructors", () => {
    it("personalScope has null org + role", () => {
        const s = personalScope(USER_A)
        expect(s).toEqual({ userId: USER_A, organizationId: null, role: null })
        expect(isOrgScope(s)).toBe(false)
    })

    it("orgScope carries org + role", () => {
        const s = orgScope(USER_A, ORG_A, "admin")
        expect(s).toEqual({ userId: USER_A, organizationId: ORG_A, role: "admin" })
        expect(isOrgScope(s)).toBe(true)
    })
})

describe("ownerWhere", () => {
    it("personal scope filters by userId AND null org (never org-owned rows)", () => {
        expect(ownerWhere(personalScope(USER_A))).toEqual({
            userId: USER_A,
            organizationId: null,
        })
    })

    it("org scope filters by organizationId only (any member's row in the org)", () => {
        expect(ownerWhere(orgScope(USER_A, ORG_A, "member"))).toEqual({
            organizationId: ORG_A,
        })
    })
})

describe("assertCanAccess — personal scope", () => {
    it("allows the user's own personal resource", () => {
        expect(() => assertCanAccess(personalResourceA, personalScope(USER_A))).not.toThrow()
    })

    it("denies another user's personal resource (NotFound, not Forbidden)", () => {
        expect(() => assertCanAccess(personalResourceB, personalScope(USER_A))).toThrow(NotFoundError)
    })

    it("denies an org-owned resource even when userId matches (must use org scope)", () => {
        // orgResourceA was created by USER_A but belongs to ORG_A — invisible personally.
        expect(() => assertCanAccess(orgResourceA, personalScope(USER_A))).toThrow(NotFoundError)
    })
})

describe("assertCanAccess — organization scope", () => {
    it("allows a resource owned by the active org", () => {
        expect(() => assertCanAccess(orgResourceA, orgScope(USER_A, ORG_A, "member"))).not.toThrow()
    })

    it("allows access to a co-member's org resource (org-owned, different creator)", () => {
        const coMemberResource: Ownable = { userId: USER_B, organizationId: ORG_A }
        expect(() => assertCanAccess(coMemberResource, orgScope(USER_A, ORG_A, "member"))).not.toThrow()
    })

    it("CROSS-TENANT: denies a resource owned by a different org", () => {
        expect(() => assertCanAccess(orgResourceB, orgScope(USER_A, ORG_A, "owner"))).toThrow(NotFoundError)
    })

    it("denies a personal resource while in org scope", () => {
        expect(() => assertCanAccess(personalResourceA, orgScope(USER_A, ORG_A, "owner"))).toThrow(NotFoundError)
    })
})

describe("assertCanAccess — minRole gating", () => {
    it("member is denied an admin-only action (in scope, but Forbidden)", () => {
        expect(() =>
            assertCanAccess(orgResourceA, orgScope(USER_A, ORG_A, "member"), { minRole: "admin" }),
        ).toThrow(ForbiddenError)
    })

    it("admin satisfies a minRole of admin", () => {
        expect(() =>
            assertCanAccess(orgResourceA, orgScope(USER_A, ORG_A, "admin"), { minRole: "admin" }),
        ).not.toThrow()
    })

    it("owner satisfies a minRole of admin", () => {
        expect(() =>
            assertCanAccess(orgResourceA, orgScope(USER_A, ORG_A, "owner"), { minRole: "admin" }),
        ).not.toThrow()
    })

    it("owner-only action denied to admin", () => {
        expect(() =>
            assertCanAccess(orgResourceA, orgScope(USER_A, ORG_A, "admin"), { minRole: "owner" }),
        ).toThrow(ForbiddenError)
    })

    it("minRole on a personal scope is Forbidden (no org role exists)", () => {
        expect(() =>
            assertCanAccess(personalResourceA, personalScope(USER_A), { minRole: "admin" }),
        ).toThrow(ForbiddenError)
    })

    it("out-of-scope check takes precedence over role check (NotFound wins)", () => {
        // Different org + insufficient role → must still be NotFound (don't leak existence).
        expect(() =>
            assertCanAccess(orgResourceB, orgScope(USER_A, ORG_A, "member"), { minRole: "owner" }),
        ).toThrow(NotFoundError)
    })
})
