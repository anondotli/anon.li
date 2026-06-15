import "server-only"

import { prisma } from "@/lib/prisma"
import { meetsMinRole, type OrgRole } from "@/lib/ownership"

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
export async function getOrgRole(userId: string, organizationId: string): Promise<OrgRole | null> {
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

/** Organization ids the user is a member of. */
export async function getMemberOrgIds(userId: string): Promise<string[]> {
    const memberships = await prisma.member.findMany({
        where: { userId },
        select: { organizationId: true },
    })
    return memberships.map((m) => m.organizationId)
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
