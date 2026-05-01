/**
 * Form Service for anon.li Form
 *
 * E2EE form collection. Metadata (title, description, schema) is plaintext —
 * anyone with the public link can read it. Submissions are hybrid-encrypted
 * (ECDH + AES-GCM) to the form's public key; only the creator decrypts.
 *
 * File uploads reuse DropService: every submission with files is paired with
 * a Drop owned by the form creator, so the creator's storage quota is charged.
 */

import { prisma } from "@/lib/prisma"
import { customAlphabet } from "nanoid"
import crypto from "node:crypto"
import { createLogger } from "@/lib/logger"
import { Prisma } from "@prisma/client"
import type { Form, FormSubmission, FormOwnerKey } from "@prisma/client"
import {
    ValidationError,
    NotFoundError,
    ForbiddenError,
    UpgradeRequiredError,
} from "@/lib/api-error-utils"
import { getFormLimitsAsync } from "@/lib/limits"
import { getEffectiveTiers } from "@/lib/entitlements"
import { PLAN_ENTITLEMENTS } from "@/config/plans"
import { AUTH_TAG_SIZE, DAY_MS } from "@/lib/constants"
import { FormSchemaDoc, type FormSchemaDoc as FormSchemaDocType } from "@/lib/form-schema"
import { hashUploadToken } from "@/lib/services/drop-upload-token"
import { validateAttachmentManifestAgainstSchema } from "@/lib/services/form-upload"
import { persistOwnedFormKey } from "@/lib/vault/form-owner-keys"

const generateFormId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 12)
const generateSubmissionId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 14)

const logger = createLogger("FormService")

type FormTier = "free" | "plus" | "pro"

function nextFormTier(currentTier: FormTier): "plus" | "pro" {
    return currentTier === "free" ? "plus" : "pro"
}

export interface CreateFormInput {
    title: string
    description?: string | null
    schema: FormSchemaDocType
    publicKey: string
    wrappedPrivateKey: string
    vaultGeneration: number
    allowFileUploads?: boolean
    maxFileSizeOverride?: number | null
    maxSubmissions?: number | null
    closesAt?: string | null
    hideBranding?: boolean
    notifyOnSubmission?: boolean
    customKey?: boolean
    salt?: string | null
    customKeyData?: string | null
    customKeyIv?: string | null
    customKeyVerifier?: string | null
}

export interface UpdateFormInput {
    title?: string
    description?: string | null
    schema?: FormSchemaDocType
    active?: boolean
    disabledByUser?: boolean
    allowFileUploads?: boolean
    maxFileSizeOverride?: number | null
    maxSubmissions?: number | null
    closesAt?: string | null
    hideBranding?: boolean
    notifyOnSubmission?: boolean
    customKey?: boolean
    salt?: string | null
    customKeyData?: string | null
    customKeyIv?: string | null
    customKeyVerifier?: string | null
}

export interface FormListItem {
    id: string
    title: string
    description: string | null
    active: boolean
    disabledByUser: boolean
    takenDown: boolean
    allowFileUploads: boolean
    submissionsCount: number
    maxSubmissions: number | null
    closesAt: Date | null
    hideBranding: boolean
    notifyOnSubmission: boolean
    createdAt: Date
    updatedAt: Date
}

export interface PublicFormView {
    id: string
    title: string
    description: string | null
    schema: FormSchemaDocType
    publicKey: string
    customKey: boolean
    salt: string | null
    customKeyData: string | null
    customKeyIv: string | null
    active: boolean
    hideBranding: boolean
    closesAt: Date | null
    allowFileUploads: boolean
    maxFileSizeOverride: number | null
}

export interface SubmissionListItem {
    id: string
    createdAt: Date
    readAt: Date | null
    hasAttachedDrop: boolean
}

export interface SubmissionDetail extends SubmissionListItem {
    ephemeralPubKey: string
    iv: string
    encryptedPayload: string
    attachedDropId: string | null
}

export class FormService {
    static async createForm(userId: string, input: CreateFormInput) {
        const schema = FormSchemaDoc.parse(input.schema)
        const schemaHasFileUploads = schema.fields.some((field) => field.type === "file")

        const limits = await getFormLimitsAsync(userId)
        const tiers = await getEffectiveTiers(userId)

        const existing = await prisma.form.count({ where: { userId, deletedAt: null } })
        if (limits.forms !== -1 && existing >= limits.forms) {
            throw new UpgradeRequiredError(
                `Your plan allows ${limits.forms} forms. Upgrade to create more.`,
                {
                    scope: "form_forms",
                    currentTier: tiers.form,
                    suggestedTier: nextFormTier(tiers.form),
                    currentValue: existing,
                    limitValue: limits.forms,
                },
            )
        }

        if (input.hideBranding && !limits.removeBranding) {
            throw new UpgradeRequiredError("Branding removal requires Pro.", {
                scope: "form_branding",
                currentTier: tiers.form,
                suggestedTier: "pro",
            })
        }

        if (input.customKey && !limits.customKey) {
            throw new UpgradeRequiredError("Password-protected forms require Plus.", {
                scope: "form_custom_key",
                currentTier: tiers.form,
                suggestedTier: "plus",
            })
        }

        if (input.customKey && !hasCustomKeyMaterial(input)) {
            throw new ValidationError("customKey forms require password material")
        }

        if (schemaHasFileUploads && limits.maxSubmissionFileSize === 0) {
            throw new UpgradeRequiredError("File uploads require Plus.", {
                scope: "form_file_uploads",
                currentTier: tiers.form,
                suggestedTier: "plus",
            })
        }

        const formId = generateFormId()

        const form = await prisma.$transaction(async (tx) => {
            const created = await tx.form.create({
                data: {
                    id: formId,
                    userId,
                    title: input.title,
                    description: input.description ?? null,
                    schemaJson: JSON.stringify(schema),
                    publicKey: input.publicKey,
                    allowFileUploads: schemaHasFileUploads,
                    maxFileSizeOverride: input.maxFileSizeOverride != null ? BigInt(input.maxFileSizeOverride) : null,
                    maxSubmissions: input.maxSubmissions ?? null,
                    closesAt: input.closesAt ? new Date(input.closesAt) : null,
                    hideBranding: input.hideBranding ?? false,
                    notifyEmailFallback: input.notifyOnSubmission ?? true,
                    customKey: input.customKey ?? false,
                    salt: input.customKey ? input.salt : null,
                    customKeyData: input.customKey ? input.customKeyData : null,
                    customKeyIv: input.customKey ? input.customKeyIv : null,
                    customKeyVerifier: input.customKey ? input.customKeyVerifier : null,
                },
            })

            await persistOwnedFormKey(tx, userId, formId, input.wrappedPrivateKey, input.vaultGeneration)

            return created
        })

        logger.info("Form created", { formId: form.id, userId, tier: tiers.form })
        return form
    }

    static async listForms(
        userId: string,
        options: { limit?: number; offset?: number; includeDeleted?: boolean } = {},
    ): Promise<{ forms: FormListItem[]; total: number }> {
        const { limit = 25, offset = 0, includeDeleted = false } = options
        const where: Prisma.FormWhereInput = { userId }
        if (!includeDeleted) where.deletedAt = null

        const [forms, total] = await Promise.all([
            prisma.form.findMany({
                where,
                orderBy: { createdAt: "desc" },
                take: limit,
                skip: offset,
            }),
            prisma.form.count({ where }),
        ])

        return {
            forms: forms.map((f) => ({
                id: f.id,
                title: f.title,
                description: f.description,
                active: f.active,
                disabledByUser: f.disabledByUser,
                takenDown: f.takenDown,
                allowFileUploads: f.allowFileUploads,
                submissionsCount: f.submissionsCount,
                maxSubmissions: f.maxSubmissions,
                closesAt: f.closesAt,
                hideBranding: f.hideBranding,
                notifyOnSubmission: f.notifyEmailFallback || f.notifyAliasId !== null,
                createdAt: f.createdAt,
                updatedAt: f.updatedAt,
            })),
            total,
        }
    }

    static async getFormForOwner(formId: string, userId: string) {
        const form = await prisma.form.findUnique({
            where: { id: formId },
            include: { ownerKey: true },
        })
        if (!form || form.deletedAt) throw new NotFoundError("Form not found")
        if (form.userId !== userId) throw new ForbiddenError("Unauthorized")
        return form as Form & { ownerKey: FormOwnerKey | null }
    }

    static async getPublicForm(formId: string): Promise<PublicFormView> {
        const form = await prisma.form.findUnique({
            where: { id: formId },
        })
        if (!form || form.deletedAt) throw new NotFoundError("Form not found")
        if (form.takenDown) {
            const err = new Error("Form has been taken down") as Error & { status?: number }
            err.status = 410
            throw err
        }

        const schema = FormSchemaDoc.parse(JSON.parse(form.schemaJson))

        // Re-resolve owner entitlements at render so a downgrade (Pro → Plus/Free)
        // forces branding back on, even if Form.hideBranding is still true in DB.
        const ownerLimits = await getFormLimitsAsync(form.userId)
        const effectiveHideBranding = form.hideBranding && ownerLimits.removeBranding

        return {
            id: form.id,
            title: form.title,
            description: form.description,
            schema,
            publicKey: form.publicKey,
            customKey: form.customKey,
            salt: form.salt,
            customKeyData: form.customKeyData,
            customKeyIv: form.customKeyIv,
            active: form.active && !form.disabledByUser,
            hideBranding: effectiveHideBranding,
            closesAt: form.closesAt,
            allowFileUploads: form.allowFileUploads,
            maxFileSizeOverride: form.maxFileSizeOverride != null ? Number(form.maxFileSizeOverride) : null,
        }
    }

    static async updateForm(formId: string, userId: string, input: UpdateFormInput) {
        const form = await prisma.form.findUnique({ where: { id: formId } })
        if (!form || form.deletedAt) throw new NotFoundError("Form not found")
        if (form.userId !== userId) throw new ForbiddenError("Unauthorized")

        const [limits, tiers] = await Promise.all([
            getFormLimitsAsync(userId),
            getEffectiveTiers(userId),
        ])

        if (input.hideBranding === true && !limits.removeBranding) {
            throw new UpgradeRequiredError("Branding removal requires Pro.", {
                scope: "form_branding",
                currentTier: tiers.form,
                suggestedTier: "pro",
            })
        }
        if (input.customKey === true && !limits.customKey) {
            throw new UpgradeRequiredError("Password-protected forms require Plus.", {
                scope: "form_custom_key",
                currentTier: tiers.form,
                suggestedTier: "plus",
            })
        }
        if (input.customKey === true && !hasCustomKeyMaterial(input)) {
            throw new ValidationError("customKey forms require password material")
        }
        const nextSchema = input.schema ? FormSchemaDoc.parse(input.schema) : FormSchemaDoc.parse(JSON.parse(form.schemaJson))
        const schemaHasFileUploads = nextSchema.fields.some((field) => field.type === "file")

        if (schemaHasFileUploads && limits.maxSubmissionFileSize === 0) {
            throw new UpgradeRequiredError("File uploads require Plus.", {
                scope: "form_file_uploads",
                currentTier: tiers.form,
                suggestedTier: "plus",
            })
        }

        const updated = await prisma.form.update({
            where: { id: formId },
            data: {
                ...(input.title !== undefined && { title: input.title }),
                ...(input.description !== undefined && { description: input.description }),
                ...(input.schema !== undefined && { schemaJson: JSON.stringify(nextSchema) }),
                ...(input.active !== undefined && { active: input.active }),
                ...(input.disabledByUser !== undefined && { disabledByUser: input.disabledByUser }),
                allowFileUploads: schemaHasFileUploads,
                ...(input.maxFileSizeOverride !== undefined && {
                    maxFileSizeOverride: input.maxFileSizeOverride != null ? BigInt(input.maxFileSizeOverride) : null,
                }),
                ...(input.maxSubmissions !== undefined && { maxSubmissions: input.maxSubmissions }),
                ...(input.closesAt !== undefined && {
                    closesAt: input.closesAt ? new Date(input.closesAt) : null,
                }),
                ...(input.hideBranding !== undefined && { hideBranding: input.hideBranding }),
                ...(input.notifyOnSubmission !== undefined && {
                    notifyEmailFallback: input.notifyOnSubmission,
                    notifyAliasId: null,
                }),
                ...(input.customKey !== undefined && {
                    customKey: input.customKey,
                    salt: input.customKey ? input.salt ?? null : null,
                    customKeyData: input.customKey ? input.customKeyData ?? null : null,
                    customKeyIv: input.customKey ? input.customKeyIv ?? null : null,
                    customKeyVerifier: input.customKey ? input.customKeyVerifier ?? null : null,
                }),
            },
        })

        return updated
    }

    static async toggleForm(formId: string, userId: string): Promise<boolean> {
        const form = await prisma.form.findUnique({ where: { id: formId } })
        if (!form || form.deletedAt) throw new NotFoundError("Form not found")
        if (form.userId !== userId) throw new ForbiddenError("Unauthorized")

        const next = !form.disabledByUser
        await prisma.form.update({
            where: { id: formId },
            data: { disabledByUser: next },
        })
        return next
    }

    static async deleteForm(formId: string, userId: string): Promise<void> {
        const form = await prisma.form.findUnique({
            where: { id: formId },
            include: {
                submissions: { select: { id: true, attachedDropId: true } },
            },
        })
        if (!form || form.deletedAt) throw new NotFoundError("Form not found")
        if (form.userId !== userId) throw new ForbiddenError("Unauthorized")

        // Import lazily to break potential circular deps with DropService
        const { DropService } = await import("@/lib/services/drop")

        for (const sub of form.submissions) {
            if (sub.attachedDropId) {
                try {
                    await DropService.deleteDrop(sub.attachedDropId, userId)
                } catch (err) {
                    logger.warn("Failed to delete attached drop for submission", {
                        submissionId: sub.id,
                        dropId: sub.attachedDropId,
                        error: err,
                    })
                }
            }
        }

        await prisma.form.delete({ where: { id: formId } })
    }

    /**
     * Enforce monthly submission cap using a rolling 30-day window.
     * The denormalized Form.submissionsCount stays as a convenience counter.
     */
    private static async enforceMonthlyCap(
        form: Form,
        ownerLimits: { submissionsPerMonth: number },
        ownerTier: FormTier,
    ) {
        if (ownerLimits.submissionsPerMonth === -1) return
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        const count = await prisma.formSubmission.count({
            where: { formId: form.id, createdAt: { gte: since } },
        })
        if (count >= ownerLimits.submissionsPerMonth) {
            throw new UpgradeRequiredError("This form has reached its monthly submission cap.", {
                scope: "form_submissions",
                currentTier: ownerTier,
                suggestedTier: nextFormTier(ownerTier),
                currentValue: count,
                limitValue: ownerLimits.submissionsPerMonth,
            })
        }
    }

    /**
     * Record a submission. `submitterUserId` is the server-resolved id of a
     * logged-in submitter (or null for anonymous). `submitterIp` is the raw
     * IP, hashed here with the pepper before persisting.
     */
    static async recordSubmission(
        formId: string,
        payload: {
            ephemeralPubKey: string
            iv: string
            encryptedPayload: string
            attachedDropId?: string | null
            attachmentUploadToken?: string | null
            attachmentManifest?: {
                fieldId: string
                fileId: string
                size: number
                mimeType: string
            }[]
            customKeyProof?: string | null
        },
        context: { submitterUserId?: string | null; submitterIp?: string | null } = {},
    ): Promise<FormSubmission> {
        const form = await prisma.form.findUnique({ where: { id: formId } })
        if (!form || form.deletedAt) throw new NotFoundError("Form not found")
        if (form.takenDown) throw new ForbiddenError("Form unavailable")
        if (!form.active || form.disabledByUser) throw new ForbiddenError("Form is closed")
        if (form.closesAt && form.closesAt.getTime() < Date.now()) {
            throw new ForbiddenError("Form has closed")
        }
        if (form.maxSubmissions && form.submissionsCount >= form.maxSubmissions) {
            throw new ForbiddenError("Form submission cap reached")
        }
        assertCustomKeyProof(form, payload.customKeyProof)

        const [ownerLimits, ownerTiers] = await Promise.all([
            getFormLimitsAsync(form.userId),
            getEffectiveTiers(form.userId),
        ])
        await FormService.enforceMonthlyCap(form, ownerLimits, ownerTiers.form)

        if (payload.attachedDropId && !form.allowFileUploads) {
            throw new ValidationError("This form does not accept file uploads")
        }
        if (!payload.attachedDropId && (payload.attachmentUploadToken || payload.attachmentManifest?.length)) {
            throw new ValidationError("Attachment metadata requires an attached drop")
        }

        let attachmentTokenHash: string | null = null
        let dropRetentionExpiresAt: Date | null = null
        if (payload.attachedDropId) {
            if (!payload.attachmentUploadToken) {
                throw new ValidationError("Attachment upload token is required")
            }
            if (!payload.attachmentManifest || payload.attachmentManifest.length === 0) {
                throw new ValidationError("Attachment manifest is required")
            }

            const attachedDrop = await prisma.drop.findUnique({
                where: { id: payload.attachedDropId },
                include: {
                    files: {
                        select: {
                            id: true,
                            size: true,
                            mimeType: true,
                            chunkCount: true,
                            uploadComplete: true,
                        },
                    },
                    formSubmission: { select: { id: true } },
                },
            })
            if (!attachedDrop || attachedDrop.deletedAt) {
                throw new ValidationError("Attached drop not found")
            }
            if (attachedDrop.takenDown || attachedDrop.disabled) {
                throw new ValidationError("Attached drop is not available")
            }
            if (attachedDrop.userId !== form.userId) {
                throw new ForbiddenError("Attached drop owner mismatch")
            }
            if (attachedDrop.formSubmission) {
                throw new ValidationError("Attached drop has already been submitted")
            }
            if (!attachedDrop.uploadComplete || attachedDrop.files.some((file) => !file.uploadComplete)) {
                throw new ValidationError("Attached drop upload is incomplete")
            }

            validateAttachmentManifestAgainstSchema(form.schemaJson, payload.attachmentManifest, attachedDrop.files)
            const attachmentLimit = form.maxFileSizeOverride != null
                ? Number(form.maxFileSizeOverride)
                : ownerLimits.maxSubmissionFileSize
            const plaintextBytes = attachedDrop.files.reduce((sum, file) => {
                return sum + Math.max(0, Number(file.size) - (file.chunkCount ?? 1) * AUTH_TAG_SIZE)
            }, 0)
            if (plaintextBytes > attachmentLimit) {
                throw new UpgradeRequiredError("Attachment size exceeds this form's file upload limit.", {
                    scope: "form_file_uploads",
                    currentTier: ownerTiers.form,
                    suggestedTier: nextFormTier(ownerTiers.form),
                    currentValue: plaintextBytes,
                    limitValue: attachmentLimit,
                })
            }
            attachmentTokenHash = hashUploadToken(payload.attachmentUploadToken)

            const retentionDays = ownerLimits.retentionDays
            dropRetentionExpiresAt = new Date(Date.now() + retentionDays * DAY_MS)
        }

        const submissionId = generateSubmissionId()
        const ipHash = context.submitterIp ? hashIp(context.submitterIp) : null

        const submission = await prisma.$transaction(async (tx) => {
            if (payload.attachedDropId && attachmentTokenHash) {
                const token = await tx.uploadToken.deleteMany({
                    where: {
                        tokenHash: attachmentTokenHash,
                        dropId: payload.attachedDropId,
                        formId,
                        expiresAt: { gt: new Date() },
                    },
                })
                if (token.count !== 1) {
                    throw new ValidationError("Attachment upload token expired or already used")
                }

                const drop = await tx.drop.updateMany({
                    where: {
                        id: payload.attachedDropId,
                        userId: form.userId,
                        uploadComplete: true,
                        deletedAt: null,
                        takenDown: false,
                    },
                    data: { expiresAt: dropRetentionExpiresAt },
                })
                if (drop.count !== 1) {
                    throw new ValidationError("Attached drop is not available")
                }
            }

            // Atomic increment that re-asserts every closure condition. If the
            // form was disabled, taken down, soft-deleted, or hit its cap in
            // the window between the read above and this update, the row
            // count is 0 and we abort.
            const maxClause = form.maxSubmissions
                ? Prisma.sql`AND "submissionsCount" < ${form.maxSubmissions}`
                : Prisma.empty
            const updated = await tx.$executeRaw`
                UPDATE "forms"
                SET "submissionsCount" = "submissionsCount" + 1,
                    "updatedAt" = NOW()
                WHERE "id" = ${formId}
                  AND "active" = true
                  AND "disabledByUser" = false
                  AND "takenDown" = false
                  AND "deletedAt" IS NULL
                  AND ("closesAt" IS NULL OR "closesAt" > NOW())
                  ${maxClause}
            `
            if (updated === 0) {
                throw new ForbiddenError("Form is no longer accepting submissions")
            }

            return tx.formSubmission.create({
                data: {
                    id: submissionId,
                    formId,
                    ephemeralPubKey: payload.ephemeralPubKey,
                    iv: payload.iv,
                    encryptedPayload: payload.encryptedPayload,
                    attachedDropId: payload.attachedDropId ?? null,
                    submitterUserId: context.submitterUserId ?? null,
                    submitterIpHash: ipHash,
                },
            })
        })

        logger.info("Submission recorded", { formId, submissionId: submission.id })
        return submission
    }

    static async listSubmissions(
        formId: string,
        userId: string,
        options: { limit?: number; offset?: number; unreadOnly?: boolean } = {},
    ): Promise<{ submissions: SubmissionListItem[]; total: number }> {
        const { limit = 25, offset = 0, unreadOnly = false } = options
        const form = await prisma.form.findUnique({ where: { id: formId } })
        if (!form || form.deletedAt) throw new NotFoundError("Form not found")
        if (form.userId !== userId) throw new ForbiddenError("Unauthorized")

        const where: Prisma.FormSubmissionWhereInput = { formId }
        if (unreadOnly) where.readAt = null

        const [submissions, total] = await Promise.all([
            prisma.formSubmission.findMany({
                where,
                orderBy: { createdAt: "desc" },
                take: limit,
                skip: offset,
                select: {
                    id: true,
                    createdAt: true,
                    readAt: true,
                    attachedDropId: true,
                },
            }),
            prisma.formSubmission.count({ where }),
        ])

        return {
            submissions: submissions.map((s) => ({
                id: s.id,
                createdAt: s.createdAt,
                readAt: s.readAt,
                hasAttachedDrop: s.attachedDropId !== null,
            })),
            total,
        }
    }

    static async getSubmission(
        submissionId: string,
        userId: string,
        options: { markRead?: boolean } = {},
    ): Promise<SubmissionDetail> {
        const sub = await prisma.formSubmission.findUnique({
            where: { id: submissionId },
            include: { form: { select: { userId: true, deletedAt: true } } },
        })
        if (!sub || sub.form.deletedAt) throw new NotFoundError("Submission not found")
        if (sub.form.userId !== userId) throw new ForbiddenError("Unauthorized")

        if (options.markRead && !sub.readAt) {
            await prisma.formSubmission.update({
                where: { id: submissionId },
                data: { readAt: new Date() },
            })
        }

        return {
            id: sub.id,
            ephemeralPubKey: sub.ephemeralPubKey,
            iv: sub.iv,
            encryptedPayload: sub.encryptedPayload,
            attachedDropId: sub.attachedDropId,
            createdAt: sub.createdAt,
            readAt: sub.readAt ?? (options.markRead ? new Date() : null),
            hasAttachedDrop: sub.attachedDropId !== null,
        }
    }

    static async deleteSubmission(submissionId: string, userId: string): Promise<void> {
        const sub = await prisma.formSubmission.findUnique({
            where: { id: submissionId },
            include: { form: { select: { userId: true } } },
        })
        if (!sub) throw new NotFoundError("Submission not found")
        if (sub.form.userId !== userId) throw new ForbiddenError("Unauthorized")

        if (sub.attachedDropId) {
            const { DropService } = await import("@/lib/services/drop")
            try {
                await DropService.deleteDrop(sub.attachedDropId, userId)
            } catch (err) {
                logger.warn("Failed to delete attached drop", { dropId: sub.attachedDropId, error: err })
            }
        }

        await prisma.formSubmission.delete({ where: { id: submissionId } })
    }

    static async getOwnerKeyRecord(formId: string, userId: string) {
        const form = await prisma.form.findUnique({
            where: { id: formId },
            include: { ownerKey: true },
        })
        if (!form || form.deletedAt) throw new NotFoundError("Form not found")
        if (form.userId !== userId) throw new ForbiddenError("Unauthorized")
        return form.ownerKey
    }

    static async countActiveForms(userId: string) {
        return prisma.form.count({ where: { userId, deletedAt: null } })
    }

    static async countRecentSubmissionsForOwner(userId: string, windowDays = 30): Promise<number> {
        const since = new Date(Date.now() - windowDays * DAY_MS)
        return prisma.formSubmission.count({
            where: {
                createdAt: { gte: since },
                form: {
                    userId,
                    deletedAt: null,
                },
            },
        })
    }

    static async getRetentionWindowDays(userId: string): Promise<number> {
        const limits = await getFormLimitsAsync(userId)
        return limits.retentionDays
    }

    static async getFreeFallbackRetentionDays(): Promise<number> {
        return PLAN_ENTITLEMENTS.form.free.retentionDays
    }

    static async verifyCustomKeyProof(formId: string, proof?: string | null): Promise<void> {
        const form = await prisma.form.findUnique({
            where: { id: formId },
            select: {
                id: true,
                customKey: true,
                customKeyVerifier: true,
            },
        })
        if (!form) throw new NotFoundError("Form not found")
        assertCustomKeyProof(form, proof)
    }
}

type CustomKeyMaterial = {
    salt?: string | null
    customKeyData?: string | null
    customKeyIv?: string | null
    customKeyVerifier?: string | null
}

function hasCustomKeyMaterial(input: CustomKeyMaterial): boolean {
    return Boolean(input.salt && input.customKeyData && input.customKeyIv && input.customKeyVerifier)
}

function assertCustomKeyProof(
    form: { customKey: boolean; customKeyVerifier?: string | null },
    proof?: string | null,
): void {
    if (!form.customKey) return
    if (!form.customKeyVerifier) {
        throw new ForbiddenError("Password-protected form is not configured")
    }
    if (!proof) {
        throw new ForbiddenError("Form password verification required")
    }
    const expected = Buffer.from(form.customKeyVerifier)
    const actual = Buffer.from(hashCustomKeyProof(proof))
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
        throw new ForbiddenError("Invalid form password")
    }
}

function hashCustomKeyProof(proof: string): string {
    return crypto.createHash("sha256").update(proof).digest("base64url")
}

function hashIp(ip: string): string {
    const pepper = process.env.IP_HASH_PEPPER
    if (!pepper) throw new Error("IP_HASH_PEPPER environment variable is missing")
    return crypto.createHash("sha256").update(`${ip}${pepper}`).digest("hex")
}
