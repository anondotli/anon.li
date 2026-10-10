import "server-only"
import { prisma } from "@/lib/prisma"
import { activeTeamSubscriptionWhere } from "@/lib/subscription-entitlement"

/**
 * How many members an org with no paid subscription may have. Purchase-first:
 * an unsubscribed team holds only its owner — inviting teammates requires buying
 * Business seats. better-auth's invite/accept routes enforce this via
 * `membershipLimit` (getOrgSeatLimit), so this single value gates invites.
 */
export const FREE_TEAM_MEMBER_LIMIT = 1

/**
 * Max members allowed for an org: its paid seat count (from an active
 * business/manual subscription), otherwise the free allowance. Used as
 * better-auth's `membershipLimit` so accepting an invite cannot exceed the
 * seats the org is paying for.
 */
export async function getOrgSeatLimit(organizationId: string): Promise<number> {
    const sub = await prisma.subscription.findFirst({
        where: activeTeamSubscriptionWhere(organizationId),
        orderBy: { seats: "desc" },
        select: { seats: true },
    })
    return sub ? Math.max(sub.seats, 1) : FREE_TEAM_MEMBER_LIMIT
}

export interface OrgSeatUsage {
    limit: number
    members: number
    /** Pending invitations that have not expired — each reserves a seat. */
    pendingInvitations: number
}

/**
 * Seats in use or reserved: current members plus pending, unexpired
 * invitations. Inviting and reducing seats both check against this, so an
 * owner can't hand out more invitations than paid seats (which would let
 * later accepts fail unpredictably) or shrink seats under outstanding invites.
 */
export async function getOrgSeatUsage(organizationId: string, now: Date = new Date()): Promise<OrgSeatUsage> {
    const [limit, members, pendingInvitations] = await Promise.all([
        getOrgSeatLimit(organizationId),
        prisma.member.count({ where: { organizationId } }),
        prisma.invitation.count({
            where: { organizationId, status: "pending", expiresAt: { gt: now } },
        }),
    ])
    return { limit, members, pendingInvitations }
}
