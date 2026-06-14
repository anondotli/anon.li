import "server-only"
import { prisma } from "@/lib/prisma"

/**
 * Assemble a portable, metadata-only export of an organization's data, for the
 * data-portability requirement enterprises ask about. EVERYTHING is scoped by
 * `organizationId` — the tenant boundary — and no secrets are included (no
 * wrapped keys, API-key hashes, or ciphertext payloads). The caller MUST first
 * confirm the requester is an owner/admin of `organizationId`.
 */
export async function buildOrgDataExport(organizationId: string) {
    const [organization, members, aliases, domains, recipients, forms, subscriptions, auditLog] =
        await Promise.all([
            prisma.organization.findUnique({
                where: { id: organizationId },
                select: {
                    name: true,
                    slug: true,
                    createdAt: true,
                    enforce2FA: true,
                },
            }),
            prisma.member.findMany({
                where: { organizationId },
                select: { role: true, createdAt: true, user: { select: { email: true, name: true } } },
            }),
            prisma.alias.findMany({
                where: { organizationId },
                select: { email: true, localPart: true, domain: true, active: true, format: true, createdAt: true },
            }),
            prisma.domain.findMany({
                where: { organizationId },
                select: { domain: true, verified: true, createdAt: true },
            }),
            prisma.recipient.findMany({
                where: { organizationId },
                select: { email: true, verified: true, isDefault: true, createdAt: true },
            }),
            prisma.form.findMany({
                where: { organizationId },
                select: { id: true, createdAt: true },
            }),
            prisma.subscription.findMany({
                where: { organizationId, status: { in: ["active", "trialing"] } },
                select: { product: true, tier: true, seats: true, status: true, currentPeriodEnd: true },
            }),
            prisma.auditLog.findMany({
                where: { organizationId },
                orderBy: { createdAt: "desc" },
                take: 500,
                select: { action: true, actorId: true, targetId: true, createdAt: true },
            }),
        ])

    return {
        exportedAt: new Date().toISOString(),
        organization,
        members: members.map((m) => ({
            email: m.user?.email ?? null,
            name: m.user?.name ?? null,
            role: m.role,
            joinedAt: m.createdAt,
        })),
        aliases,
        domains,
        recipients,
        forms,
        subscriptions,
        auditLog,
    }
}
