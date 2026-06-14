"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/logger"
import { type ActionState, runScopedAction } from "@/lib/safe-action"
import { FormService } from "@/lib/services/form"
import { createFormSchema, updateFormSchema, FormId, SubmissionId } from "@/lib/validations/form"
import { assertVaultIdentity } from "@/lib/vault/identity"
import { evaluateBan } from "@/lib/data/user-bans"
import {
    FormOwnerKeyConflictError,
} from "@/lib/vault/form-owner-keys"
import {
    vaultGenerationSchema,
    vaultIdSchema,
} from "@/lib/vault/validation"
import type { UpgradeRequiredDetails } from "@/lib/api-error-utils"

const logger = createLogger("FormActions")

// ============================================================================
// Schemas
// ============================================================================

const createFormActionSchema = createFormSchema.and(z.object({
    vaultId: vaultIdSchema,
    vaultGeneration: vaultGenerationSchema,
    // Org-context forms: the wrappedPrivateKey is wrapped to the org vault key at
    // this generation. The trusted scope (not this field) decides org-ownership.
    orgKeyGeneration: z.number().int().positive().optional(),
}))

const updateFormActionSchema = updateFormSchema

// ============================================================================
// Response types
// ============================================================================

export type CreateFormActionResult = {
    error?: string
    code?: string
    upgrade?: UpgradeRequiredDetails
    formId?: string
}

// ============================================================================
// Actions
// ============================================================================

async function canCreateForm(userId: string): Promise<{ allowed: true } | { allowed: false; error: string }> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { banned: true, banFileUpload: true, banReason: true },
    })
    if (!user) return { allowed: false, error: "Unauthorized" }
    const ban = evaluateBan(user, "upload")
    if (ban) return { allowed: false, error: ban.reason }
    return { allowed: true }
}

export async function createFormAction(
    input: z.input<typeof createFormActionSchema>,
): Promise<CreateFormActionResult> {
    const result = await runScopedAction(
        { schema: createFormActionSchema, data: input, rateLimitKey: "formCreate" },
        async (validated, scope): Promise<CreateFormActionResult> => {
            const userId = scope.userId
            const { vaultId, ...formInput } = validated

            const permission = await canCreateForm(userId)
            if (!permission.allowed) return { error: permission.error, code: "FORBIDDEN" }

            if (scope.organizationId) {
                // Org form: the owner key is wrapped to the shared org vault key,
                // so there is no personal vault identity to assert. Require the
                // org key generation the client wrapped with.
                if (!formInput.orgKeyGeneration) {
                    return { error: "Missing team key generation for an organization form" }
                }
            } else {
                await assertVaultIdentity(userId, vaultId, formInput.vaultGeneration)
            }

            try {
                const form = await FormService.createForm(scope, formInput)
                revalidatePath("/dashboard/form")
                return { formId: form.id }
            } catch (err) {
                if (err instanceof FormOwnerKeyConflictError) {
                    logger.warn("Form owner key conflict during creation", { userId })
                    return { error: "Unable to persist form key" }
                }
                throw err
            }
        },
    )

    if (result.error) return { error: result.error, code: result.code, upgrade: result.upgrade }
    return result.data ?? { error: "Failed to create form" }
}

const updateFormPayloadSchema = z.object({
    id: FormId,
    payload: updateFormActionSchema,
})

export async function updateFormAction(
    formId: string,
    input: z.infer<typeof updateFormActionSchema>,
): Promise<ActionState<{ id: string }>> {
    return runScopedAction(
        { schema: updateFormPayloadSchema, data: { id: formId, payload: input }, rateLimitKey: "formOps" },
        async (validated, scope) => {
            const updated = await FormService.updateForm(validated.id, scope, validated.payload)
            revalidatePath("/dashboard/form")
            revalidatePath(`/dashboard/form/${validated.id}`)
            return { id: updated.id }
        },
    )
}

const formIdActionSchema = z.object({ id: FormId })
const submissionIdActionSchema = z.object({ id: SubmissionId })

export async function toggleFormAction(formId: string): Promise<ActionState<{ disabled: boolean }>> {
    return runScopedAction(
        { schema: formIdActionSchema, data: { id: formId }, rateLimitKey: "formOps" },
        async (validated, scope) => {
            const disabled = await FormService.toggleForm(validated.id, scope)
            revalidatePath("/dashboard/form")
            revalidatePath(`/dashboard/form/${validated.id}`)
            return { disabled }
        },
    )
}

export async function deleteFormAction(formId: string): Promise<ActionState> {
    return runScopedAction(
        { schema: formIdActionSchema, data: { id: formId }, rateLimitKey: "formOps" },
        async (validated, scope) => {
            await FormService.deleteForm(validated.id, scope)
            revalidatePath("/dashboard/form")
        },
    )
}

export async function deleteSubmissionAction(submissionId: string): Promise<ActionState> {
    return runScopedAction(
        { schema: submissionIdActionSchema, data: { id: submissionId }, rateLimitKey: "formOps" },
        async (validated, scope) => {
            await FormService.deleteSubmission(validated.id, scope)
            revalidatePath("/dashboard/form")
        },
    )
}
