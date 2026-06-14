import "server-only"

import { prisma } from "@/lib/prisma"

/**
 * Membership helpers for org shared-E2EE owner-key access. An org-owned owner
 * key (organizationId set, wrapped to the org vault key) is readable by ANY
 * member of that org — these helpers gate that, distinct from the personal
 * owner-key path which is gated to the owning user.
 */

/** True when the user is a member (any role) of the organization. */
export async function isOrgMember(userId: string, organizationId: string): Promise<boolean> {
    const member = await prisma.member.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
        select: { id: true },
    })
    return Boolean(member)
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
