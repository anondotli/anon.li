"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/logger"
import { type ActionState, runSecureAction } from "@/lib/safe-action"
import { FormService } from "@/lib/services/form"
import { createFormSchema, updateFormSchema, FormId, SubmissionId } from "@/lib/validations/form"
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

async function assertVaultIdentity(userId: string, vaultId: string, vaultGeneration: number) {
    const security = await prisma.userSecurity.findUnique({
        where: { userId },
        select: { id: true, vaultGeneration: true },
    })
    if (!security) throw new Error("Vault security is not configured")
    if (security.id !== vaultId) throw new Error("Vault identity mismatch")
    if (security.vaultGeneration !== vaultGeneration) throw new Error("Vault generation mismatch")
}

async function canCreateForm(userId: string): Promise<{ allowed: true } | { allowed: false; error: string }> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { banned: true, banFileUpload: true, banReason: true },
    })
    if (!user) return { allowed: false, error: "Unauthorized" }
    if (user.banned) return { allowed: false, error: user.banReason || "Account suspended" }
    if (user.banFileUpload) return { allowed: false, error: "File uploads are disabled for this account" }
    return { allowed: true }
}

export async function createFormAction(
    input: z.input<typeof createFormActionSchema>,
): Promise<CreateFormActionResult> {
    const result = await runSecureAction(
        { schema: createFormActionSchema, data: input, rateLimitKey: "formCreate" },
        async (validated, userId): Promise<CreateFormActionResult> => {
            const { vaultId, ...formInput } = validated

            const permission = await canCreateForm(userId)
            if (!permission.allowed) return { error: permission.error, code: "FORBIDDEN" }

            await assertVaultIdentity(userId, vaultId, formInput.vaultGeneration)

            try {
                const form = await FormService.createForm(userId, formInput)
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
    return runSecureAction(
        { schema: updateFormPayloadSchema, data: { id: formId, payload: input }, rateLimitKey: "formOps" },
        async (validated, userId) => {
            const updated = await FormService.updateForm(validated.id, userId, validated.payload)
            revalidatePath("/dashboard/form")
            revalidatePath(`/dashboard/form/${validated.id}`)
            return { id: updated.id }
        },
    )
}

const formIdActionSchema = z.object({ id: FormId })
const submissionIdActionSchema = z.object({ id: SubmissionId })

export async function toggleFormAction(formId: string): Promise<ActionState<{ disabled: boolean }>> {
    return runSecureAction(
        { schema: formIdActionSchema, data: { id: formId }, rateLimitKey: "formOps" },
        async (validated, userId) => {
            const disabled = await FormService.toggleForm(validated.id, userId)
            revalidatePath("/dashboard/form")
            revalidatePath(`/dashboard/form/${validated.id}`)
            return { disabled }
        },
    )
}

export async function deleteFormAction(formId: string): Promise<ActionState> {
    return runSecureAction(
        { schema: formIdActionSchema, data: { id: formId }, rateLimitKey: "formOps" },
        async (validated, userId) => {
            await FormService.deleteForm(validated.id, userId)
            revalidatePath("/dashboard/form")
        },
    )
}

export async function deleteSubmissionAction(submissionId: string): Promise<ActionState> {
    return runSecureAction(
        { schema: submissionIdActionSchema, data: { id: submissionId }, rateLimitKey: "formOps" },
        async (validated, userId) => {
            await FormService.deleteSubmission(validated.id, userId)
            revalidatePath("/dashboard/form")
        },
    )
}
