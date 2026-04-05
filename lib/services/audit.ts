import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/logger"

const logger = createLogger("Audit")

type AuditAction =
    | "api_key.create"
    | "api_key.delete"
    | "drop.takedown"
    | "drop.restore"
    | "alias.takedown"
    | "user.ban"
    | "user.unban"
    | "report.resolve"
    | "report.dismiss"
    | "admin.warning_sent"
    | "auth.failed"

interface AuditEntry {
    action: AuditAction
    actorId: string
    targetId?: string
    metadata?: Record<string, unknown>
    ip?: string
}

/**
 * Record an audit log entry for sensitive operations.
 * Fire-and-forget — callers should not await this.
 */
export async function audit(entry: AuditEntry): Promise<void> {
    try {
        await prisma.auditLog.create({
            data: {
                action: entry.action,
                actorId: entry.actorId,
                targetId: entry.targetId ?? null,
                metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
                ip: entry.ip ?? null,
            },
        })
    } catch (error) {
        // Audit logging must never break the main flow
        logger.error("Failed to write audit log", { action: entry.action, error })
    }
}
