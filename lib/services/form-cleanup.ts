/**
 * Form cleanup operations for cron jobs.
 *
 * - Purge submissions older than the form owner's plan retention window.
 * - Hard-delete soft-deleted forms after 7d grace (mirrors drop cleanup).
 */

import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/logger"
import { orgScope, personalScope, type OwnerScope } from "@/lib/ownership"
import { PLAN_ENTITLEMENTS } from "@/config/plans"
import { DOWNGRADE_DELETION_DELAY_DAYS, DOWNGRADE_SCHEDULING_DELAY_DAYS } from "@/lib/constants"
import { getFormOwnerEntitlements } from "@/lib/services/form-entitlements"
import type { Prisma } from "@prisma/client"

const logger = createLogger("FormCleanupService")
const BATCH_SIZE = 200

const DAY_MS = 24 * 60 * 60 * 1000
const GRACE_DAYS = 7
const USAGE_LEDGER_RETENTION_DAYS = 90

type SubmissionCleanupCandidate = {
    id: string
    formId: string
    createdAt: Date
    attachedDropId: string | null
}

type DeletedFormCleanupCandidate = {
    id: string
    // Nullable: org-owned forms whose creating user was deleted (userId SetNull).
    userId: string | null
    organizationId: string | null
    deletedAt: Date | null
    submissions: { id: string; attachedDropId: string | null }[]
}

type CleanupFormOwner = { userId: string | null; organizationId: string | null }

function cleanupScope(owner: CleanupFormOwner): OwnerScope | null {
    if (owner.organizationId) {
        // Internal cleanup principal; tenancy is established by organizationId.
        return orgScope(owner.userId ?? "form-cleanup", owner.organizationId, "owner")
    }
    return owner.userId ? personalScope(owner.userId) : null
}

export class FormCleanupService {
    /**
     * Quota enforcement only needs the current UTC calendar month. Keep a
     * conservative 90-day audit window, then erase owner identifiers so the
     * content-free ledger does not grow or retain deleted-account IDs forever.
     */
    static async cleanupOldUsageEvents(dryRun = false): Promise<{
        found: number
        deleted: number
        errors: string[]
    }> {
        const cutoff = new Date(Date.now() - USAGE_LEDGER_RETENTION_DAYS * DAY_MS)
        const found = await prisma.formUsageEvent.count({
            where: { createdAt: { lt: cutoff } },
        })
        if (dryRun || found === 0) return { found, deleted: 0, errors: [] }

        const deleted = await prisma.formUsageEvent.deleteMany({
            where: { createdAt: { lt: cutoff } },
        })
        return { found, deleted: deleted.count, errors: [] }
    }

    /**
     * Purge submissions older than the owning user's plan retention window.
     * Attached drops are deleted via DropService (which reclaims storage quota).
     */
    static async cleanupExpiredSubmissions(dryRun = false): Promise<{
        found: number
        deleted: number
        errors: string[]
    }> {
        const errors: string[] = []
        let found = 0
        let deleted = 0

        // Group by form owner so we only resolve entitlements once per user.
        // The generous upper bound (all submissions older than the smallest
        // retention in any plan) keeps this pass cheap.
        const minRetentionDays = Math.min(
            PLAN_ENTITLEMENTS.form.free.retentionDays,
            PLAN_ENTITLEMENTS.form.plus.retentionDays,
            PLAN_ENTITLEMENTS.form.pro.retentionDays,
        )

        const candidateCutoff = new Date(Date.now() - minRetentionDays * DAY_MS)
        let lastSeen: { createdAt: Date; id: string } | null = null

        while (true) {
            const where: Prisma.FormSubmissionWhereInput = lastSeen
                ? {
                      AND: [
                          { createdAt: { lt: candidateCutoff } },
                          {
                              OR: [
                                  { createdAt: { gt: lastSeen.createdAt } },
                                  { createdAt: lastSeen.createdAt, id: { gt: lastSeen.id } },
                              ],
                          },
                      ],
                  }
                : { createdAt: { lt: candidateCutoff } }
            const candidates: SubmissionCleanupCandidate[] = await prisma.formSubmission.findMany({
                where,
                select: {
                    id: true,
                    formId: true,
                    createdAt: true,
                    attachedDropId: true,
                },
                take: BATCH_SIZE,
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            })

            if (candidates.length === 0) break
            found += candidates.length
            const latestCandidate = candidates[candidates.length - 1]
            if (latestCandidate) {
                lastSeen = { createdAt: latestCandidate.createdAt, id: latestCandidate.id }
            }
            if (dryRun) {
                if (candidates.length < BATCH_SIZE) break
                continue
            }

            const formIds = Array.from(new Set(candidates.map((c) => c.formId)))
            const forms = await prisma.form.findMany({
                where: { id: { in: formIds } },
                select: {
                    id: true,
                    userId: true,
                    organizationId: true,
                    user: {
                        select: {
                            downgradedAt: true,
                            subscriptions: {
                                where: {
                                    organizationId: null,
                                    product: { in: ["form", "bundle", "business"] },
                                    status: { in: ["active", "trialing"] },
                                },
                                select: { currentPeriodEnd: true },
                            },
                        },
                    },
                    organization: { select: { formRetentionGraceUntil: true } },
                },
            })
            const formById = new Map(forms.map((form) => [form.id, form]))
            const ownerByFormId = new Map(forms.map((form) => [form.id, {
                userId: form.userId,
                organizationId: form.organizationId,
            }]))

            // Resolve retention per OWNER (org or user), deduped. An org-owned
            // form derives retention from the ORG plan — NOT the creator — so it
            // is never purged at 0 days when the creator left/was deleted (userId
            // NULL). Retention cleanup is destructive, so entitlement lookup
            // failures fail closed: that owner's submissions are skipped until a
            // later run can resolve the authoritative plan.
            const ownerKeyOf = (f: { userId: string | null; organizationId: string | null }) =>
                f.organizationId ? `org:${f.organizationId}` : `user:${f.userId ?? "null"}`
            const retentionByOwner = new Map<string, number>()
            for (const form of forms) {
                const key = ownerKeyOf(form)
                if (retentionByOwner.has(key)) continue
                if (!form.organizationId && !form.userId) {
                    logger.warn("Skipping retention cleanup for ownerless form", { formId: form.id })
                    continue
                }
                try {
                    const { limits, subscribed } = await getFormOwnerEntitlements({ userId: form.userId, organizationId: form.organizationId })
                    if (
                        form.organizationId
                        && !subscribed
                        && !form.organization?.formRetentionGraceUntil
                    ) {
                        logger.warn("Skipping retention cleanup until organization grace is established", {
                            organizationId: form.organizationId,
                        })
                        continue
                    }
                    retentionByOwner.set(key, limits.retentionDays)
                } catch (e) {
                    logger.warn("Failed to resolve retention for form owner", { ownerKey: key, error: e })
                }
            }
            const retentionByFormId = new Map(
                forms.flatMap((form) => {
                    const retention = retentionByOwner.get(ownerKeyOf(form))
                    return retention === undefined ? [] : [[form.id, retention] as const]
                }),
            )

            const now = Date.now()
            const expired = candidates.filter((c) => {
                const form = formById.get(c.formId)
                if (!form) return false
                if (form?.organization?.formRetentionGraceUntil
                    && form.organization.formRetentionGraceUntil.getTime() > now
                ) {
                    return false
                }
                if (
                    !form.organizationId
                    && !form.user?.downgradedAt
                    && form.user?.subscriptions?.some((subscription) => (
                        subscription.currentPeriodEnd
                        && subscription.currentPeriodEnd.getTime() + DAY_MS <= now
                    ))
                ) {
                    // A stale active-status row means billing reconciliation has
                    // not yet established downgradedAt. Never let destructive
                    // cleanup win that race.
                    return false
                }
                if (!form.organizationId && form.user?.downgradedAt) {
                    const graceMs = (DOWNGRADE_SCHEDULING_DELAY_DAYS + DOWNGRADE_DELETION_DELAY_DAYS) * DAY_MS
                    if (form.user.downgradedAt.getTime() + graceMs > now) return false
                }
                const retention = retentionByFormId.get(c.formId)
                if (retention === undefined) return false
                return now - c.createdAt.getTime() >= retention * DAY_MS
            })

            if (expired.length === 0) {
                if (candidates.length < BATCH_SIZE) break
                continue
            }

            const { DropService } = await import("@/lib/services/drop")
            for (const sub of expired) {
                try {
                    const owner = ownerByFormId.get(sub.formId)
                    if (!owner) {
                        logger.warn("Skipping submission cleanup without form owner", {
                            submissionId: sub.id,
                            formId: sub.formId,
                        })
                        continue
                    }
                    if (sub.attachedDropId) {
                        const ownerScope = cleanupScope(owner)
                        try {
                            if (ownerScope) await DropService.deleteDrop(sub.attachedDropId, ownerScope)
                        } catch (e) {
                            // Compatibility with pre-tenant-inheritance org attachments.
                            if (owner.organizationId && owner.userId) {
                                try {
                                    await DropService.deleteDrop(sub.attachedDropId, personalScope(owner.userId))
                                } catch {
                                    logger.warn("Failed to delete attached drop during submission cleanup", { submissionId: sub.id, dropId: sub.attachedDropId, error: e })
                                }
                            } else {
                                logger.warn("Failed to delete attached drop during submission cleanup", { submissionId: sub.id, dropId: sub.attachedDropId, error: e })
                            }
                        }
                    }
                    await prisma.formSubmission.delete({ where: { id: sub.id } })
                    deleted++
                } catch (e) {
                    logger.error("Failed to delete expired submission", e, { submissionId: sub.id })
                    errors.push(sub.id)
                }
            }

            if (candidates.length < BATCH_SIZE) break
        }

        return { found, deleted, errors }
    }

    /**
     * Hard-delete forms that were soft-deleted more than GRACE_DAYS ago.
     * Cascade removes submissions + FormOwnerKey; any attached drops are
     * deleted separately in cleanupExpiredSubmissions.
     */
    static async cleanupDeletedForms(dryRun = false): Promise<{
        found: number
        deleted: number
        errors: string[]
    }> {
        const cutoff = new Date(Date.now() - GRACE_DAYS * DAY_MS)
        const errors: string[] = []
        let found = 0
        let deleted = 0
        let lastSeen: { deletedAt: Date; id: string } | null = null

        while (true) {
            const where: Prisma.FormWhereInput = lastSeen
                ? {
                      AND: [
                          { deletedAt: { lt: cutoff } },
                          {
                              OR: [
                                  { deletedAt: { gt: lastSeen.deletedAt } },
                                  { deletedAt: lastSeen.deletedAt, id: { gt: lastSeen.id } },
                              ],
                          },
                      ],
                  }
                : { deletedAt: { lt: cutoff } }
            const forms: DeletedFormCleanupCandidate[] = await prisma.form.findMany({
                where,
                select: {
                    id: true,
                    userId: true,
                    organizationId: true,
                    deletedAt: true,
                    submissions: { select: { id: true, attachedDropId: true } },
                },
                take: BATCH_SIZE,
                orderBy: [{ deletedAt: "asc" }, { id: "asc" }],
            })

            if (forms.length === 0) break
            found += forms.length
            const latestForm = forms[forms.length - 1]
            if (latestForm?.deletedAt) {
                lastSeen = { deletedAt: latestForm.deletedAt, id: latestForm.id }
            }
            if (dryRun) {
                if (forms.length < BATCH_SIZE) break
                continue
            }

            const { DropService } = await import("@/lib/services/drop")
            for (const form of forms) {
                try {
                    const ownerScope = cleanupScope(form)
                    for (const sub of form.submissions) {
                        if (sub.attachedDropId) {
                            try {
                                if (ownerScope) await DropService.deleteDrop(sub.attachedDropId, ownerScope)
                            } catch (e) {
                                if (form.organizationId && form.userId) {
                                    try {
                                        await DropService.deleteDrop(sub.attachedDropId, personalScope(form.userId))
                                    } catch {
                                        logger.warn("Failed to delete attached drop during form cleanup", { formId: form.id, dropId: sub.attachedDropId, error: e })
                                    }
                                } else {
                                    logger.warn("Failed to delete attached drop during form cleanup", { formId: form.id, dropId: sub.attachedDropId, error: e })
                                }
                            }
                        }
                    }
                    await prisma.form.delete({ where: { id: form.id } })
                    deleted++
                } catch (e) {
                    logger.error("Failed to hard-delete form", e, { formId: form.id })
                    errors.push(form.id)
                }
            }

            if (forms.length < BATCH_SIZE) break
        }

        return { found, deleted, errors }
    }
}
