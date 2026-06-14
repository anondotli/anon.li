import { createAccessControl } from "better-auth/plugins/access"
import { adminAc, memberAc, ownerAc, defaultStatements } from "better-auth/plugins/organization/access"

/**
 * Org RBAC for the B2B layer (better-auth organization plugin). Isomorphic so the
 * same access-control instance + roles are shared by the server plugin
 * (lib/auth.ts) and the client (lib/auth-client.ts).
 *
 * Two distinct authorization surfaces:
 *
 *  1. better-auth's OWN endpoints (invite / remove member / change role /
 *     update / delete organization) are gated by the built-in
 *     organization/member/invitation statements below — these ARE enforced by
 *     better-auth via hasPermission.
 *
 *  2. OUR owned resources (aliases, domains, recipients, drops, forms, api keys)
 *     use a RANK-BASED model enforced in the service layer via
 *     `assertCanManage` / `meetsMinRole` (lib/ownership.ts): in an organization
 *     context, destructive/management ops (delete, disable) require admin+, while
 *     create/read/update are allowed for members. Personal-context callers own
 *     their resources outright and are never role-gated.
 *
 * We intentionally do NOT keep a parallel custom permission matrix here — the
 * previous alias/domain/apikey/submission/billing/sso statements were never
 * actually checked (no hasPermission call referenced them) and drifted from the
 * real, enforced rule. SSO/SCIM is not implemented, so there is deliberately no
 * `sso` statement or `ssoOnly` policy (removed to avoid implying an unshipped
 * guarantee). `enforce2FA` IS enforced (lib/access-policy.ts).
 *
 * IMPORTANT: org roles (owner/admin/member) are orthogonal to the platform
 * `User.isAdmin` super-admin flag. `isAdmin` is anon.li staff; org roles govern
 * a customer's own organization. Do not conflate the two.
 */
export const statement = { ...defaultStatements } as const

export const ac = createAccessControl(statement)

export const member = ac.newRole({ ...memberAc.statements })
export const admin = ac.newRole({ ...adminAc.statements })
export const owner = ac.newRole({ ...ownerAc.statements })

export const roles = { owner, admin, member }

export type OrgRole = keyof typeof roles

/** Narrow an arbitrary stored role string to a known OrgRole. */
export function isOrgRole(role: string): role is OrgRole {
    return role === "owner" || role === "admin" || role === "member"
}
