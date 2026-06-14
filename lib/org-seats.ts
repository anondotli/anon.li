import "server-only"
import { prisma } from "@/lib/prisma"

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
        where: {
            organizationId,
            status: { in: ["active", "trialing"] },
        },
        orderBy: { seats: "desc" },
        select: { seats: true },
    })
    return sub ? Math.max(sub.seats, 1) : FREE_TEAM_MEMBER_LIMIT
}
