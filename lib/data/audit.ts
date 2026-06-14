import "server-only"
import { prisma } from "@/lib/prisma"

export interface OrgAuditLogEntry {
    id: string
    action: string
    actorId: string
    targetId: string | null
    metadata: string | null
    createdAt: Date
}

/**
 * Read an organization's own audit trail (org-scoped events only), newest first.
 * For the org console — callers MUST first confirm the requester is an
 * owner/admin of `organizationId`. IP is intentionally omitted from the org view.
 */
export async function getOrgAuditLogs(
    organizationId: string,
    options: { limit?: number; action?: string } = {},
): Promise<OrgAuditLogEntry[]> {
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 500)
    return prisma.auditLog.findMany({
        where: {
            organizationId,
            ...(options.action ? { action: options.action } : {}),
        },
        select: {
            id: true,
            action: true,
            actorId: true,
            targetId: true,
            metadata: true,
            createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: limit,
    })
}
