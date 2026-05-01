/**
 * Form cleanup operations for cron jobs.
 *
 * - Purge submissions older than the form owner's plan retention window.
 * - Hard-delete soft-deleted forms after 7d grace (mirrors drop cleanup).
 */

import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/logger"
import { PLAN_ENTITLEMENTS } from "@/config/plans"
import { getEffectiveTiers } from "@/lib/entitlements"
import type { Prisma } from "@prisma/client"

const logger = createLogger("FormCleanupService")
const BATCH_SIZE = 200

const DAY_MS = 24 * 60 * 60 * 1000
const GRACE_DAYS = 7

type SubmissionCleanupCandidate = {
    id: string
    formId: string
    createdAt: Date
    attachedDropId: string | null
}

type DeletedFormCleanupCandidate = {
    id: string
    userId: string
    deletedAt: Date | null
    submissions: { id: string; attachedDropId: string | null }[]
}

export class FormCleanupService {
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
                select: { id: true, userId: true },
            })
            const ownerByFormId = new Map(forms.map((form) => [form.id, form.userId]))

            // Resolve retention per unique user id
            const userIds = Array.from(new Set(forms.map((form) => form.userId)))
            const retentionByUser = new Map<string, number>()
            for (const uid of userIds) {
                try {
                    const tiers = await getEffectiveTiers(uid)
                    retentionByUser.set(uid, PLAN_ENTITLEMENTS.form[tiers.form].retentionDays)
                } catch (e) {
                    logger.warn("Failed to resolve tier for retention", { userId: uid, error: e })
                    retentionByUser.set(uid, PLAN_ENTITLEMENTS.form.free.retentionDays)
                }
            }

            const now = Date.now()
            const expired = candidates.filter((c) => {
                const ownerId = ownerByFormId.get(c.formId)
                const retention = ownerId ? retentionByUser.get(ownerId) ?? PLAN_ENTITLEMENTS.form.free.retentionDays : 0
                return now - c.createdAt.getTime() >= retention * DAY_MS
            })

            if (expired.length === 0) {
                if (candidates.length < BATCH_SIZE) break
                continue
            }

            const { DropService } = await import("@/lib/services/drop")
            for (const sub of expired) {
                try {
                    const ownerId = ownerByFormId.get(sub.formId)
                    if (!ownerId) {
                        logger.warn("Skipping submission cleanup without form owner", {
                            submissionId: sub.id,
                            formId: sub.formId,
                        })
                        continue
                    }
                    if (sub.attachedDropId) {
                        try {
                            await DropService.deleteDrop(sub.attachedDropId, ownerId)
                        } catch (e) {
                            logger.warn("Failed to delete attached drop during submission cleanup", {
                                submissionId: sub.id,
                                dropId: sub.attachedDropId,
                                error: e,
                            })
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
                    for (const sub of form.submissions) {
                        if (sub.attachedDropId) {
                            try {
                                await DropService.deleteDrop(sub.attachedDropId, form.userId)
                            } catch (e) {
                                logger.warn("Failed to delete attached drop during form cleanup", {
                                    formId: form.id,
                                    dropId: sub.attachedDropId,
                                    error: e,
                                })
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
