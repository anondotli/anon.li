import "server-only"

import { prisma } from "@/lib/prisma"
import { meetsMinRole, type OrgRole } from "@/lib/ownership"
import { apiError, ErrorCodes, withNoStore } from "@/lib/api-response"

/**
 * Membership helpers for org shared-E2EE owner-key access. An org-owned owner
 * key (organizationId set, wrapped to the org vault key) is readable by ANY
 * member of that org — these helpers gate that, distinct from the personal
 * owner-key path which is gated to the owning user.
 */

const ORG_ROLES = new Set<OrgRole>(["member", "admin", "owner"])

/** True when the user is a member (any role) of the organization. */
export async function isOrgMember(userId: string, organizationId: string): Promise<boolean> {
    const member = await prisma.member.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
        select: { id: true },
    })
    return Boolean(member)
}

/**
 * The caller's role in an organization, or null if they are not a member.
 *
 * better-auth stores `Member.role` as a free-form string; we narrow it to a
 * known OrgRole and treat any unrecognized value as "no role" (null), so an
 * unexpected role can never satisfy a privilege check.
 */
async function getOrgRole(userId: string, organizationId: string): Promise<OrgRole | null> {
    const member = await prisma.member.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
        select: { role: true },
    })
    if (!member) return null
    return ORG_ROLES.has(member.role as OrgRole) ? (member.role as OrgRole) : null
}

/**
 * True when the caller is at least an admin (admin or owner) of the org — the
 * shared gate for org-vault grant/seed/rotate/list operations (ORG-E2EE §10.5).
 *
 * SECURITY: single source of truth for "may manage org keys". Every org-vault
 * route that mints, lists, or re-wraps key material must gate on this.
 */
export async function isOrgManager(userId: string, organizationId: string): Promise<boolean> {
    return meetsMinRole(await getOrgRole(userId, organizationId), "admin")
}

/**
 * Organization ids the user is a member of.
 *
 * Pass `twoFactorEnabled` when the result gates access to org key material:
 * with `false`, orgs that enforce 2FA are excluded (the same policy
 * `assertOrgVaultAccess` applies to single-org reads).
 */
export async function getMemberOrgIds(
    userId: string,
    options?: { twoFactorEnabled?: boolean | null },
): Promise<string[]> {
    const excludeEnforced2FA = options !== undefined && !options.twoFactorEnabled
    const memberships = await prisma.member.findMany({
        where: excludeEnforced2FA
            ? { userId, organization: { enforce2FA: false } }
            : { userId },
        select: { organizationId: true },
    })
    return memberships.map((m) => m.organizationId)
}

/**
 * Org-level policy gate for org vault key material (member keys, org-owned
 * owner keys, grant/seed/rotate). Membership/role is checked separately by the
 * caller; this enforces what the org itself demands:
 *
 * - `enforce2FA`: a member who hasn't enrolled 2FA gets no org key material
 *   (mirrors the org-scoped action/route policy in lib/access-policy.ts).
 * - `suspendedAt`: a suspended org is frozen, so key-material WRITES are
 *   rejected; reads stay available so members can still decrypt/export.
 *
 * Returns a ready-to-send 403 response when blocked, or null when allowed —
 * same shape as `enforceVaultRequestGuards`.
 */
export async function assertOrgVaultAccess(params: {
    user: { id: string; twoFactorEnabled?: boolean | null }
    organizationId: string
    requestId: string
    write?: boolean
}): Promise<Response | null> {
    const organization = await prisma.organization.findUnique({
        where: { id: params.organizationId },
        select: { enforce2FA: true, suspendedAt: true },
    })
    // Missing org: let the caller's own membership/existence check answer.
    if (!organization) return null

    if (organization.enforce2FA && !params.user.twoFactorEnabled) {
        return withNoStore(apiError(
            "This team requires two-factor authentication. Enable 2FA to access team encryption keys.",
            ErrorCodes.FORBIDDEN,
            params.requestId,
            403,
        ))
    }

    if (params.write && organization.suspendedAt) {
        return withNoStore(apiError("This team is suspended", ErrorCodes.FORBIDDEN, params.requestId, 403))
    }

    return null
}

/**
 * The org's authoritative current org-vault-key generation (0 = unseeded). Used
 * server-side to STAMP the generation on org-owned owner keys at create time
 * instead of trusting the client-supplied value — the recorded generation must
 * match the key the resource was actually wrapped to (which getOrgVaultKey
 * enforces is the current one). Returns 0 if the org doesn't exist.
 */
export async function getOrgKeyGeneration(organizationId: string): Promise<number> {
    const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { orgKeyGeneration: true },
    })
    return org?.orgKeyGeneration ?? 0
}
