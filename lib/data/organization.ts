import "server-only"
import { prisma } from "@/lib/prisma"

/**
 * Emails of an organization's owners + admins — the people who should receive
 * org-level operational notifications (e.g. a shared domain failing re-verification,
 * a seat/billing change). Roles are single-valued per member (owner | admin | member),
 * matching how the rest of the app treats `Member.role`.
 *
 * De-duped; empty if the org has no resolvable admin emails.
 */
export async function getOrgAdminEmails(organizationId: string): Promise<string[]> {
    const members = await prisma.member.findMany({
        where: { organizationId, role: { in: ["owner", "admin"] } },
        select: { user: { select: { email: true } } },
    })
    const emails = members
        .map((m) => m.user?.email)
        .filter((email): email is string => Boolean(email))
    return Array.from(new Set(emails))
}
