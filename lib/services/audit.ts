import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/logger"

const logger = createLogger("Audit")

type AuditAction =
    | "api_key.create"
    | "api_key.delete"
    | "drop.takedown"
    | "drop.restore"
    | "drop.delete"
    | "alias.takedown"
    | "alias.update"
    | "alias.delete"
    | "form.takedown"
    | "form.restore"
    | "form.delete"
    | "domain.verify"
    | "domain.delete"
    | "recipient.delete"
    | "user.ban"
    | "user.unban"
    | "user.delete_request"
    | "report.review"
    | "report.resolve"
    | "report.dismiss"
    | "admin.warning_sent"
    | "settings.reserved_aliases.update"
    | "deletion.process"
    | "deletion.complete"
    | "storage.orphaned_cleanup"
    | "auth.failed"
    // Org-scoped events — always pass organizationId so they appear in the org trail.
    | "org.member.add"
    | "org.member.remove"
    | "org.member.role_change"
    | "org.invitation.send"
    | "org.domain.verify"
    | "org.billing.seats_change"
    | "org.billing.canceled"
    | "org.vault.grant"
    | "org.vault.rotate"
    | "org.security.enforce_2fa_on"
    | "org.security.enforce_2fa_off"
    | "org.data.export"

interface AuditEntry {
    action: AuditAction
    actorId: string
    targetId?: string
    /** Set for org-scoped events so they surface in that org's audit trail. */
    organizationId?: string
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
                organizationId: entry.organizationId ?? null,
                metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
                ip: entry.ip ?? null,
            },
        })
    } catch (error) {
        // Audit logging must never break the main flow
        logger.error("Failed to write audit log", { action: entry.action, error })
    }
}

/**
 * Org member-lifecycle audit emitters, called from better-auth's
 * `organizationHooks`. Extracted here so they can be unit-tested without
 * standing up the full auth instance. `actorId` is the user who PERFORMED the
 * action (resolved from the acting session in the hook — the admin who
 * removed/changed, or the member themselves on self-accept), distinct from
 * `targetUserId`, the affected member.
 */
export function recordMemberAdded(p: { actorId: string; targetUserId: string; organizationId: string; role: string }): void {
    void audit({
        action: "org.member.add",
        actorId: p.actorId,
        targetId: p.targetUserId,
        organizationId: p.organizationId,
        metadata: { role: p.role },
    })
}

export function recordMemberRemoved(p: { actorId: string; targetUserId: string; organizationId: string; role: string }): void {
    void audit({
        action: "org.member.remove",
        actorId: p.actorId,
        targetId: p.targetUserId,
        organizationId: p.organizationId,
        metadata: { role: p.role },
    })
}

export function recordMemberRoleChanged(p: {
    actorId: string
    targetUserId: string
    organizationId: string
    from: string
    to: string
}): void {
    void audit({
        action: "org.member.role_change",
        actorId: p.actorId,
        targetId: p.targetUserId,
        organizationId: p.organizationId,
        metadata: { from: p.from, to: p.to },
    })
}

export function recordInvitationSent(p: {
    inviterId: string
    organizationId: string
    email: string
    role: string
}): void {
    void audit({
        action: "org.invitation.send",
        actorId: p.inviterId,
        organizationId: p.organizationId,
        metadata: { email: p.email, role: p.role },
    })
}
