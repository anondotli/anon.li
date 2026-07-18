/**
 * Form Service for anon.li Form
 *
 * E2EE form collection. Basic metadata is plaintext. A password-protected
 * form's question schema is withheld until the caller proves knowledge of the
 * password-derived witness. Submissions are hybrid-encrypted (ECDH + AES-GCM)
 * to the form's public key; only the creator decrypts.
 *
 * File uploads reuse DropService: every submission with files is paired with
 * a Drop owned by the form creator, so the creator's storage quota is charged.
 */

import { prisma } from "@/lib/prisma"
import { customAlphabet } from "nanoid"
import crypto from "node:crypto"
import { createLogger } from "@/lib/logger"
import { hashIp } from "@/lib/ip-hash"
import { ownerWhere, assertCanAccess, assertCanManage, personalScope, type OwnerScope } from "@/lib/ownership"
import { Prisma } from "@prisma/client"
import type { Form, FormSubmission, FormOwnerKey } from "@prisma/client"
import {
    ValidationError,
    NotFoundError,
    ForbiddenError,
    UpgradeRequiredError,
} from "@/lib/api-error-utils"
import { getFormLimitsAsync } from "@/lib/limits"
import { PLAN_ENTITLEMENTS } from "@/config/plans"
import { AUTH_TAG_SIZE, DAY_MS } from "@/lib/constants"
import { FormSchemaDoc, type FormSchemaDoc as FormSchemaDocType } from "@/lib/form-schema"
import { hashUploadToken } from "@/lib/services/drop-upload-token"
import {
    effectiveFormFileCap,
    validateAttachmentManifestAgainstSchema,
} from "@/lib/services/form-upload"
import { persistOwnedFormKey, type OwnerKeyOrgBinding } from "@/lib/vault/form-owner-keys"
import { getFormOwnerEntitlements } from "@/lib/services/form-entitlements"

const generateFormId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 12)
const generateSubmissionId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 14)

const logger = createLogger("FormService")

type FormTier = "free" | "plus" | "pro"

function nextFormTier(currentTier: FormTier): "plus" | "pro" {
    return currentTier === "free" ? "plus" : "pro"
}

interface CreateFormInput {
    title: string
    description?: string | null
    schema: FormSchemaDocType
    publicKey: string
    wrappedPrivateKey: string
    vaultGeneration: number
    // Org context: the wrappedPrivateKey is wrapped to the org vault key (shared
    // with the team) at this generation, instead of the creator's personal vault.
    orgKeyGeneration?: number
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

interface UpdateFormInput {
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

interface FormListItem {
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

interface PublicFormView {
    id: string
    title: string
    description: string | null
    schema: FormSchemaDocType | null
    fieldCount: number
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

interface SubmissionListItem {
    id: string
    createdAt: Date
    readAt: Date | null
    hasAttachedDrop: boolean
    /** Present only when listSubmissions is called with includePayload. */
    payload?: {
        ephemeralPubKey: string
        iv: string
        encryptedPayload: string
    }
}

interface SubmissionDetail extends SubmissionListItem {
    ephemeralPubKey: string
    iv: string
    encryptedPayload: string
    attachedDropId: string | null
}

type FormOwnerIdentity = Pick<Form, "userId" | "organizationId">

type FormOwnerPolicyState = FormOwnerIdentity & {
    user?: { banned: boolean; banFileUpload: boolean } | null
    organization?: { suspendedAt: Date | null } | null
}

function ownerCanAccept(form: FormOwnerPolicyState): boolean {
    if (form.organizationId) {
        return Boolean(form.organization && !form.organization.suspendedAt)
    }
    return Boolean(form.userId && form.user && !form.user.banned)
}

function ownerCanAcceptFiles(form: FormOwnerPolicyState): boolean {
    if (!ownerCanAccept(form)) return false
    return Boolean(form.organizationId || !form.user?.banFileUpload)
}

function assertOwnerCanAccept(form: FormOwnerPolicyState, requiresFileUpload = false): void {
    if (!ownerCanAccept(form)) {
        throw new ForbiddenError("Form owner is unavailable")
    }
    if (requiresFileUpload && !ownerCanAcceptFiles(form)) {
        throw new ForbiddenError("File uploads are unavailable for this form")
    }
}

function assertFormOpen(form: Pick<Form, "deletedAt" | "takenDown" | "active" | "disabledByUser" | "closesAt" | "maxSubmissions" | "submissionsCount">): void {
    if (form.deletedAt) throw new NotFoundError("Form not found")
    if (form.takenDown) throw new ForbiddenError("Form unavailable")
    if (!form.active || form.disabledByUser) throw new ForbiddenError("Form is closed")
    if (form.closesAt && form.closesAt.getTime() <= Date.now()) {
        throw new ForbiddenError("Form has closed")
    }
    if (form.maxSubmissions && form.submissionsCount >= form.maxSubmissions) {
        throw new ForbiddenError("Form submission cap reached")
    }
}

function ownerLockKey(owner: FormOwnerIdentity): string {
    return owner.organizationId
        ? `form-owner:org:${owner.organizationId}`
        : `form-owner:user:${owner.userId ?? "missing"}`
}

async function lockFormOwner(tx: Prisma.TransactionClient, owner: FormOwnerIdentity): Promise<void> {
    // One owner can have several forms. A transaction-scoped advisory lock is
    // the shared mutex for owner-wide form and submission caps across all of
    // them, without blocking unrelated user/org updates.
    await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${ownerLockKey(owner)}, 0))
    `
}

async function assertCurrentOwnerPolicy(
    tx: Prisma.TransactionClient,
    form: FormOwnerPolicyState,
    requiresFileUpload: boolean,
): Promise<void> {
    if (form.organizationId) {
        const rows = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id"
            FROM "organizations"
            WHERE "id" = ${form.organizationId}
              AND "suspended_at" IS NULL
        `
        if (rows.length !== 1) throw new ForbiddenError("Form owner is unavailable")
        return
    }

    if (!form.userId) throw new ForbiddenError("Form owner is unavailable")
    const rows = requiresFileUpload
        ? await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id"
            FROM "users"
            WHERE "id" = ${form.userId}
              AND "banned" = FALSE
              AND "banFileUpload" = FALSE
        `
        : await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id"
            FROM "users"
            WHERE "id" = ${form.userId}
              AND "banned" = FALSE
        `
    if (rows.length !== 1) throw new ForbiddenError("Form owner is unavailable")
}

async function countRecentOwnerSubmissions(
    client: Pick<Prisma.TransactionClient, "formUsageEvent">,
    owner: FormOwnerIdentity,
    since: Date,
): Promise<number> {
    return client.formUsageEvent.count({
        where: {
            createdAt: { gte: since },
            ...(owner.organizationId
                ? { organizationId: owner.organizationId }
                : { userId: owner.userId, organizationId: null }),
        },
    })
}

function startOfCurrentUtcMonth(now = new Date()): Date {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

export class FormService {
    static async createForm(scope: OwnerScope, input: CreateFormInput) {
        const schema = FormSchemaDoc.parse(input.schema)
        const schemaHasFileUploads = schema.fields.some((field) => field.type === "file")

        // Org forms derive limits/tier from the org plan; personal from the user.
        const { limits, tiers, subscribed } = await getFormOwnerEntitlements({
            userId: scope.userId,
            organizationId: scope.organizationId,
        })

        // Purchase-first Teams: an unsubscribed org is a zero-capacity workspace.
        if (scope.organizationId && !subscribed) {
            throw new UpgradeRequiredError(
                "Your team needs a Business subscription to create team forms. " +
                    "Subscribe from the Team page, or switch to your personal account to manage your own.",
                { scope: "form_forms", currentTier: "free", suggestedTier: "pro" },
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

        if (
            input.maxFileSizeOverride != null &&
            input.maxFileSizeOverride > limits.maxSubmissionFileSize
        ) {
            throw new UpgradeRequiredError("File upload limit exceeds your Form plan.", {
                scope: "form_file_uploads",
                currentTier: tiers.form,
                suggestedTier: nextFormTier(tiers.form),
                currentValue: input.maxFileSizeOverride,
                limitValue: limits.maxSubmissionFileSize,
            })
        }

        const formId = generateFormId()

        const form = await prisma.$transaction(async (tx) => {
            let orgBinding: OwnerKeyOrgBinding | undefined
            if (scope.organizationId) {
                // Lock the authoritative generation so a rotation cannot land
                // between validating the client's wrap and storing its stamp.
                const rows = await tx.$queryRaw<Array<{ orgKeyGeneration: number }>>`
                    SELECT "org_key_generation" AS "orgKeyGeneration"
                    FROM "organizations"
                    WHERE "id" = ${scope.organizationId}
                    FOR UPDATE
                `
                const currentGeneration = rows[0]?.orgKeyGeneration ?? 0
                if (currentGeneration < 1) {
                    throw new ValidationError("Team encryption key is not set up yet")
                }
                if (input.orgKeyGeneration !== currentGeneration) {
                    throw new ValidationError("Team encryption key changed. Refresh and try again.")
                }
                orgBinding = {
                    organizationId: scope.organizationId,
                    orgKeyGeneration: currentGeneration,
                }
            }

            await lockFormOwner(tx, scope)
            const existing = await tx.form.count({
                where: { ...ownerWhere(scope), deletedAt: null },
            })
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

            const created = await tx.form.create({
                data: {
                    id: formId,
                    userId: scope.userId,
                    organizationId: scope.organizationId,
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

            // Org-owned forms wrap the private key to the shared org vault key so
            // every granted member can decrypt submissions; personal forms keep
            // the per-user wrap.
            await persistOwnedFormKey(
                tx,
                scope.userId,
                formId,
                input.wrappedPrivateKey,
                input.vaultGeneration,
                orgBinding,
            )

            return created
        })

        logger.info("Form created", { formId: form.id, userId: scope.userId, tier: tiers.form })
        return form
    }

    static async listForms(
        scope: OwnerScope,
        options: { limit?: number; offset?: number; includeDeleted?: boolean } = {},
    ): Promise<{ forms: FormListItem[]; total: number }> {
        const { limit = 25, offset = 0, includeDeleted = false } = options
        const where: Prisma.FormWhereInput = { ...ownerWhere(scope) }
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

    static async getFormForOwner(formId: string, scope: OwnerScope) {
        const form = await prisma.form.findUnique({
            where: { id: formId },
            include: { ownerKey: true },
        })
        if (!form || form.deletedAt) throw new NotFoundError("Form not found")
        assertCanAccess(form, scope)
        return form as Form & { ownerKey: FormOwnerKey | null }
    }

    static async getPublicForm(
        formId: string,
        options: { customKeyProof?: string | null } = {},
    ): Promise<PublicFormView> {
        const form = await prisma.form.findUnique({
            where: { id: formId },
            include: {
                user: { select: { banned: true, banFileUpload: true } },
                organization: { select: { suspendedAt: true } },
            },
        })
        if (!form || form.deletedAt) throw new NotFoundError("Form not found")
        if (form.takenDown) {
            const err = new Error("Form has been taken down") as Error & { status?: number }
            err.status = 410
            throw err
        }

        const parsedSchema = FormSchemaDoc.parse(JSON.parse(form.schemaJson))
        if (options.customKeyProof) assertCustomKeyProof(form, options.customKeyProof)
        const schema = form.customKey && !options.customKeyProof ? null : parsedSchema

        // Re-resolve owner entitlements at render so a downgrade (Pro → Plus/Free)
        // forces branding back on, even if Form.hideBranding is still true in DB.
        // Org forms resolve from the org plan, not the (possibly departed) creator.
        const { limits: ownerLimits, subscribed } = await getFormOwnerEntitlements({ userId: form.userId, organizationId: form.organizationId })
        const effectiveHideBranding = form.hideBranding && ownerLimits.removeBranding
        const accepting = ownerCanAccept(form)

        return {
            id: form.id,
            title: form.title,
            description: form.description,
            schema,
            fieldCount: parsedSchema.fields.length,
            publicKey: form.publicKey,
            customKey: form.customKey,
            salt: form.salt,
            customKeyData: form.customKeyData,
            customKeyIv: form.customKeyIv,
            active: form.active
                && !form.disabledByUser
                && subscribed
                && accepting
                && (!form.customKey || ownerLimits.customKey),
            hideBranding: effectiveHideBranding,
            closesAt: form.closesAt,
            allowFileUploads: form.allowFileUploads && ownerCanAcceptFiles(form),
            maxFileSizeOverride: form.maxFileSizeOverride != null ? Number(form.maxFileSizeOverride) : null,
        }
    }

    static async updateForm(formId: string, scope: OwnerScope, input: UpdateFormInput) {
        const form = await prisma.form.findUnique({ where: { id: formId } })
        if (!form || form.deletedAt) throw new NotFoundError("Form not found")
        const changesLifecycle = (
            (input.active !== undefined && input.active !== form.active)
            || (input.disabledByUser !== undefined && input.disabledByUser !== form.disabledByUser)
        )
        if (changesLifecycle) {
            assertCanManage(form, scope)
        } else {
            assertCanAccess(form, scope)
        }

        const { limits, tiers } = await getFormOwnerEntitlements({ userId: scope.userId, organizationId: scope.organizationId })

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


        if (
            input.maxFileSizeOverride != null &&
            input.maxFileSizeOverride > limits.maxSubmissionFileSize
        ) {
            throw new UpgradeRequiredError("File upload limit exceeds your Form plan.", {
                scope: "form_file_uploads",
                currentTier: tiers.form,
                suggestedTier: nextFormTier(tiers.form),
                currentValue: input.maxFileSizeOverride,
                limitValue: limits.maxSubmissionFileSize,
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

    static async toggleForm(formId: string, scope: OwnerScope): Promise<boolean> {
        const form = await prisma.form.findUnique({ where: { id: formId } })
        if (!form || form.deletedAt) throw new NotFoundError("Form not found")
        // Disabling a shared org form affects the team → admin+ in org context.
        assertCanManage(form, scope)

        const next = !form.disabledByUser
        await prisma.form.update({
            where: { id: formId },
            data: { disabledByUser: next },
        })
        return next
    }

    static async deleteForm(formId: string, scope: OwnerScope): Promise<void> {
        const form = await prisma.form.findUnique({
            where: { id: formId },
            include: {
                submissions: { select: { id: true, attachedDropId: true } },
            },
        })
        if (!form || form.deletedAt) throw new NotFoundError("Form not found")
        // Deleting a shared org form + its submissions is destructive → admin+.
        assertCanManage(form, scope)

        // Import lazily to break potential circular deps with DropService
        const { DropService } = await import("@/lib/services/drop")

        // Staging Drops are not related through FormSubmission yet. Delete the
        // ones visible now; the durable formStagingId marker keeps any racing
        // straggler private so the hourly cleanup can safely reap it later.
        const stagingDrops = await prisma.drop.findMany({
            where: { formStagingId: formId },
            select: { id: true },
        })
        for (const stagingDrop of stagingDrops) {
            try {
                await DropService.deleteDrop(stagingDrop.id, scope)
            } catch (err) {
                if (form.organizationId && form.userId) {
                    try {
                        await DropService.deleteDrop(stagingDrop.id, personalScope(form.userId))
                        continue
                    } catch {
                        // Log the original scoped failure below.
                    }
                }
                logger.warn("Failed to delete staged attachment while deleting form", {
                    formId,
                    dropId: stagingDrop.id,
                    error: err,
                })
            }
        }

        for (const sub of form.submissions) {
            if (sub.attachedDropId) {
                try {
                    await DropService.deleteDrop(sub.attachedDropId, scope)
                } catch (err) {
                    // Compatibility for attachments created before form drops
                    // inherited the organization tenant.
                    if (form.organizationId && form.userId) {
                        try {
                            await DropService.deleteDrop(sub.attachedDropId, personalScope(form.userId))
                            continue
                        } catch {
                            // Log the original scoped failure below.
                        }
                    }
                    logger.warn("Failed to delete attached drop for submission", { submissionId: sub.id, dropId: sub.attachedDropId, error: err })
                }
            }
        }

        await prisma.form.delete({ where: { id: formId } })
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
        const form = await prisma.form.findUnique({
            where: { id: formId },
            include: {
                user: { select: { banned: true, banFileUpload: true } },
                organization: { select: { suspendedAt: true } },
            },
        })
        if (!form) throw new NotFoundError("Form not found")
        assertFormOpen(form)
        assertOwnerCanAccept(form, Boolean(payload.attachedDropId))
        assertCustomKeyProof(form, payload.customKeyProof)

        if (payload.attachedDropId && !form.allowFileUploads) {
            throw new ValidationError("This form does not accept file uploads")
        }
        if (!payload.attachedDropId && (payload.attachmentUploadToken || payload.attachmentManifest?.length)) {
            throw new ValidationError("Attachment metadata requires an attached drop")
        }

        if (payload.attachedDropId) {
            if (!payload.attachmentUploadToken) {
                throw new ValidationError("Attachment upload token is required")
            }
            if (!payload.attachmentManifest || payload.attachmentManifest.length === 0) {
                throw new ValidationError("Attachment manifest is required")
            }
        }

        const attachmentTokenHash = payload.attachmentUploadToken
            ? hashUploadToken(payload.attachmentUploadToken)
            : null

        const submissionId = generateSubmissionId()
        const ipHash = context.submitterIp ? hashIp(context.submitterIp) : null

        const submission = await prisma.$transaction(async (tx) => {
            // Check the target owner's current moderation state before taking
            // the shared quota mutex. This query intentionally does not retain a
            // row lock: file reservations lock Drop → User, so retaining User
            // here while later waiting on Drop would invert that order.
            await assertCurrentOwnerPolicy(tx, form, Boolean(payload.attachedDropId))
            await lockFormOwner(tx, form)

            // Linearize acceptance against concurrent builder edits. Any update
            // that rotates/enables the password, disables files, closes the Form,
            // or lowers its cap must commit either before or after this decision.
            await tx.$queryRaw`
                SELECT "id" FROM "forms" WHERE "id" = ${formId} FOR UPDATE
            `
            const liveForm = await tx.form.findUnique({
                where: { id: formId },
                include: {
                    user: { select: { banned: true, banFileUpload: true } },
                    organization: { select: { suspendedAt: true } },
                },
            })
            if (!liveForm) throw new NotFoundError("Form not found")
            assertFormOpen(liveForm)
            assertOwnerCanAccept(liveForm, Boolean(payload.attachedDropId))
            assertCustomKeyProof(liveForm, payload.customKeyProof)

            const {
                limits: liveLimits,
                tiers: liveTiers,
                subscribed: liveSubscribed,
            } = await getFormOwnerEntitlements({
                userId: liveForm.userId,
                organizationId: liveForm.organizationId,
            })
            if (liveForm.organizationId && !liveSubscribed) {
                throw new UpgradeRequiredError("This team form is paused until its Business subscription is active.", {
                    scope: "form_submissions",
                    currentTier: "free",
                    suggestedTier: "pro",
                })
            }
            if (liveForm.customKey && !liveLimits.customKey) {
                throw new UpgradeRequiredError("Password-protected forms require Form Plus or Pro.", {
                    scope: "form_custom_key",
                    currentTier: liveTiers.form,
                    suggestedTier: nextFormTier(liveTiers.form),
                })
            }
            if (payload.attachedDropId && !liveForm.allowFileUploads) {
                throw new ValidationError("This form does not accept file uploads")
            }

            if (liveLimits.submissionsPerMonth !== -1) {
                const recentCount = await countRecentOwnerSubmissions(tx, liveForm, startOfCurrentUtcMonth())
                if (recentCount >= liveLimits.submissionsPerMonth) {
                    throw new UpgradeRequiredError("This owner has reached its monthly submission cap.", {
                        scope: "form_submissions",
                        currentTier: liveTiers.form,
                        suggestedTier: nextFormTier(liveTiers.form),
                        currentValue: recentCount,
                        limitValue: liveLimits.submissionsPerMonth,
                    })
                }
            }

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

                await tx.$queryRaw`
                    SELECT "id" FROM "drops" WHERE "id" = ${payload.attachedDropId} FOR UPDATE
                `
                const attachedDrop = await tx.drop.findUnique({
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
                if (
                    attachedDrop.takenDown
                    || attachedDrop.disabled
                    || attachedDrop.formStagingId !== formId
                ) {
                    throw new ValidationError("Attached drop is not available")
                }
                const ownerMatches = liveForm.organizationId
                    ? attachedDrop.organizationId === liveForm.organizationId
                    : attachedDrop.organizationId === null && attachedDrop.userId === liveForm.userId
                if (!ownerMatches) throw new ForbiddenError("Attached drop owner mismatch")
                if (attachedDrop.formSubmission) {
                    throw new ValidationError("Attached drop has already been submitted")
                }
                if (!attachedDrop.uploadComplete || attachedDrop.files.some((file) => !file.uploadComplete)) {
                    throw new ValidationError("Attached drop upload is incomplete")
                }

                validateAttachmentManifestAgainstSchema(
                    liveForm.schemaJson,
                    payload.attachmentManifest ?? [],
                    attachedDrop.files,
                )
                const attachmentLimit = effectiveFormFileCap(
                    liveForm,
                    liveLimits.maxSubmissionFileSize,
                )
                const plaintextBytes = attachedDrop.files.reduce((sum, file) => (
                    sum + Math.max(0, Number(file.size) - (file.chunkCount ?? 1) * AUTH_TAG_SIZE)
                ), 0)
                if (plaintextBytes > attachmentLimit) {
                    throw new UpgradeRequiredError("Attachment size exceeds this form's file upload limit.", {
                        scope: "form_file_uploads",
                        currentTier: liveTiers.form,
                        suggestedTier: nextFormTier(liveTiers.form),
                        currentValue: plaintextBytes,
                        limitValue: attachmentLimit,
                    })
                }

                const dropRetentionExpiresAt = new Date(
                    Date.now() + liveLimits.retentionDays * DAY_MS,
                )
                const drop = await tx.drop.updateMany({
                    where: {
                        id: payload.attachedDropId,
                        formStagingId: formId,
                        ...(liveForm.organizationId
                            ? { organizationId: liveForm.organizationId }
                            : { userId: liveForm.userId, organizationId: null }),
                        uploadComplete: true,
                        deletedAt: null,
                        takenDown: false,
                    },
                    data: {
                        expiresAt: dropRetentionExpiresAt,
                        formStagingId: null,
                    },
                })
                if (drop.count !== 1) {
                    throw new ValidationError("Attached drop is not available")
                }
            }

            // Use the live database cap, not a value captured before the lock.
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
                  AND ("maxSubmissions" IS NULL OR "submissionsCount" < "maxSubmissions")
            `
            if (updated === 0) {
                throw new ForbiddenError("Form is no longer accepting submissions")
            }

            const created = await tx.formSubmission.create({
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
            await tx.formUsageEvent.createMany({
                data: [{
                    id: created.id,
                    userId: liveForm.organizationId ? null : liveForm.userId,
                    organizationId: liveForm.organizationId,
                    createdAt: created.createdAt,
                }],
                skipDuplicates: true,
            })
            return created
        })

        logger.info("Submission recorded", { formId, submissionId: submission.id })
        return submission
    }

    static async listSubmissions(
        formId: string,
        scope: OwnerScope,
        options: { limit?: number; offset?: number; unreadOnly?: boolean; includePayload?: boolean } = {},
    ): Promise<{ submissions: SubmissionListItem[]; total: number }> {
        const { limit = 25, offset = 0, unreadOnly = false, includePayload = false } = options
        const form = await prisma.form.findUnique({ where: { id: formId } })
        if (!form || form.deletedAt) throw new NotFoundError("Form not found")
        assertCanAccess(form, scope)

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
                    ...(includePayload
                        ? { ephemeralPubKey: true, iv: true, encryptedPayload: true }
                        : {}),
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
                ...(includePayload && "ephemeralPubKey" in s
                    ? {
                          payload: {
                              ephemeralPubKey: s.ephemeralPubKey,
                              iv: s.iv,
                              encryptedPayload: s.encryptedPayload,
                          },
                      }
                    : {}),
            })),
            total,
        }
    }

    /**
     * Aggregate counts for a form's submissions (owner-scoped). Cheap, indexed
     * COUNTs — used for accurate dashboard metrics independent of pagination.
     */
    static async getSubmissionStats(
        formId: string,
        scope: OwnerScope,
    ): Promise<{ total: number; unread: number; withAttachments: number }> {
        const form = await prisma.form.findUnique({ where: { id: formId } })
        if (!form || form.deletedAt) throw new NotFoundError("Form not found")
        assertCanAccess(form, scope)

        const [total, unread, withAttachments] = await Promise.all([
            prisma.formSubmission.count({ where: { formId } }),
            prisma.formSubmission.count({ where: { formId, readAt: null } }),
            prisma.formSubmission.count({ where: { formId, attachedDropId: { not: null } } }),
        ])

        return { total, unread, withAttachments }
    }

    static async getSubmission(
        submissionId: string,
        scope: OwnerScope,
        options: { markRead?: boolean } = {},
    ): Promise<SubmissionDetail> {
        const sub = await prisma.formSubmission.findUnique({
            where: { id: submissionId },
            include: { form: { select: { userId: true, organizationId: true, deletedAt: true } } },
        })
        if (!sub || sub.form.deletedAt) throw new NotFoundError("Submission not found")
        assertCanAccess(sub.form, scope)

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

    static async deleteSubmission(submissionId: string, scope: OwnerScope): Promise<void> {
        const sub = await prisma.formSubmission.findUnique({
            where: { id: submissionId },
            include: { form: { select: { userId: true, organizationId: true } } },
        })
        if (!sub) throw new NotFoundError("Submission not found")
        // Deleting org submission data is destructive → admin+ in org context.
        assertCanManage(sub.form, scope)

        if (sub.attachedDropId) {
            const { DropService } = await import("@/lib/services/drop")
            try {
                await DropService.deleteDrop(sub.attachedDropId, scope)
            } catch (err) {
                if (sub.form.organizationId && sub.form.userId) {
                    try {
                        await DropService.deleteDrop(sub.attachedDropId, personalScope(sub.form.userId))
                    } catch {
                        logger.warn("Failed to delete attached drop", { dropId: sub.attachedDropId, error: err })
                    }
                } else {
                    logger.warn("Failed to delete attached drop", { dropId: sub.attachedDropId, error: err })
                }
            }
        }

        await prisma.formSubmission.delete({ where: { id: submissionId } })
    }

    static async getOwnerKeyRecord(formId: string, scope: OwnerScope) {
        const form = await prisma.form.findUnique({
            where: { id: formId },
            include: { ownerKey: true },
        })
        if (!form || form.deletedAt) throw new NotFoundError("Form not found")
        assertCanAccess(form, scope)
        return form.ownerKey
    }

    static async countActiveForms(userId: string) {
        // Personal forms only — org forms count against the org, not the user.
        return prisma.form.count({ where: { userId, organizationId: null, deletedAt: null } })
    }

    static async countRecentSubmissionsForOwner(userId: string, windowDays = 30): Promise<number> {
        return countRecentOwnerSubmissions(
            prisma,
            { userId, organizationId: null },
            new Date(Date.now() - windowDays * DAY_MS),
        )
    }

    static async countRecentSubmissions(scope: OwnerScope, windowDays = 30): Promise<number> {
        return countRecentOwnerSubmissions(prisma, scope, new Date(Date.now() - windowDays * DAY_MS))
    }

    static async countCurrentMonthSubmissions(scope: OwnerScope): Promise<number> {
        return countRecentOwnerSubmissions(prisma, scope, startOfCurrentUtcMonth())
    }

    static async getRetentionWindowDays(userId: string): Promise<number> {
        const limits = await getFormLimitsAsync(userId)
        return limits.retentionDays
    }

    static async getFreeFallbackRetentionDays(): Promise<number> {
        return PLAN_ENTITLEMENTS.form.free.retentionDays
    }

    /**
     * Fast, read-only preflight before provisioning attachment storage. The
     * final submission transaction repeats every mutable check under locks.
     */
    static async assertAcceptingSubmissions(
        formId: string,
        proof?: string | null,
        options: { fileUpload?: boolean } = {},
    ): Promise<void> {
        const form = await prisma.form.findUnique({
            where: { id: formId },
            include: {
                user: { select: { banned: true, banFileUpload: true } },
                organization: { select: { suspendedAt: true } },
            },
        })
        if (!form) throw new NotFoundError("Form not found")
        assertFormOpen(form)
        assertOwnerCanAccept(form, options.fileUpload)
        if (options.fileUpload && !form.allowFileUploads) {
            throw new ForbiddenError("This form does not accept file uploads")
        }
        assertCustomKeyProof(form, proof)

        const { limits, tiers, subscribed } = await getFormOwnerEntitlements({
            userId: form.userId,
            organizationId: form.organizationId,
        })
        if (form.organizationId && !subscribed) {
            throw new UpgradeRequiredError("This team form is paused until its Business subscription is active.", {
                scope: "form_submissions",
                currentTier: "free",
                suggestedTier: "pro",
            })
        }
        if (form.customKey && !limits.customKey) {
            throw new UpgradeRequiredError("Password-protected forms require Form Plus or Pro.", {
                scope: "form_custom_key",
                currentTier: tiers.form,
                suggestedTier: nextFormTier(tiers.form),
            })
        }
        if (limits.submissionsPerMonth !== -1) {
            const used = await countRecentOwnerSubmissions(prisma, form, startOfCurrentUtcMonth())
            if (used >= limits.submissionsPerMonth) {
                throw new UpgradeRequiredError("This owner has reached its monthly submission cap.", {
                    scope: "form_submissions",
                    currentTier: tiers.form,
                    suggestedTier: nextFormTier(tiers.form),
                    currentValue: used,
                    limitValue: limits.submissionsPerMonth,
                })
            }
        }
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
