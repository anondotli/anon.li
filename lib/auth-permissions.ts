import { createAccessControl } from "better-auth/plugins/access"
import { adminAc, memberAc, ownerAc, defaultStatements } from "better-auth/plugins/organization/access"

/**
 * Org RBAC for the B2B layer. This module is intentionally isomorphic so the
 * exact same access-control instance and role definitions are shared by the
 * better-auth server plugin (lib/auth.ts) and the client (lib/auth-client.ts).
 *
 * IMPORTANT: org roles (owner/admin/member) are orthogonal to the platform
 * `User.isAdmin` super-admin flag. `isAdmin` is anon.li staff; org roles govern
 * a customer's own organization. Do not conflate the two.
 */
export const statement = {
    ...defaultStatements,
    // Custom B2B resource permissions (in addition to better-auth's built-in
    // organization/member/invitation/team statements from defaultStatements).
    alias: ["create", "read", "update", "delete"],
    domain: ["create", "verify", "delete"],
    apikey: ["create", "delete"],
    submission: ["read"],
    billing: ["read", "manage"],
    sso: ["manage"],
} as const

export const ac = createAccessControl(statement)

/** Regular members: manage shared aliases and read form submissions. */
export const member = ac.newRole({
    ...memberAc.statements,
    alias: ["create", "read", "update"],
    submission: ["read"],
})

/** Org admins: full resource management + read-only billing. */
export const admin = ac.newRole({
    ...adminAc.statements,
    alias: ["create", "read", "update", "delete"],
    domain: ["create", "verify", "delete"],
    apikey: ["create", "delete"],
    submission: ["read"],
    billing: ["read"],
})

/** Org owners: everything, including billing management and SSO configuration. */
export const owner = ac.newRole({
    ...ownerAc.statements,
    alias: ["create", "read", "update", "delete"],
    domain: ["create", "verify", "delete"],
    apikey: ["create", "delete"],
    submission: ["read"],
    billing: ["read", "manage"],
    sso: ["manage"],
})

export const roles = { owner, admin, member }

export type OrgRole = keyof typeof roles

/** Narrow an arbitrary stored role string to a known OrgRole. */
export function isOrgRole(role: string): role is OrgRole {
    return role === "owner" || role === "admin" || role === "member"
}
