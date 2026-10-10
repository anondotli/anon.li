"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { AliasService } from "@/lib/services/alias"
import { runScopedAction, type ActionState } from "@/lib/safe-action"
import { createAliasSchema, updateAliasEncryptedMetadataSchema, updateAliasSchema } from "@/lib/validations/alias"

// Dashboard edits can set the full forwarding list (primary first), matching
// the v1 API's recipient_ids, so extra recipients are never silently dropped.
const updateAliasRoutingSchema = updateAliasSchema.extend({
  recipientIds: z.array(z.string().min(1).max(50)).min(1).max(10).optional(),
})

export async function createAliasAction(data: {
  localPart?: string | null
  domain: string
  format?: "RANDOM" | "CUSTOM"
  recipientId?: string
}): Promise<ActionState<{ alias: { id: string; email: string; organizationId: string | null } }>> {
  return runScopedAction({
    schema: createAliasSchema,
    data,
    rateLimitKey: "aliasCreate",
  }, async (validated, scope) => {
    const alias = await AliasService.createAlias(scope, {
      localPart: validated.localPart ?? undefined,
      domain: validated.domain,
      format: validated.format,
      recipientId: validated.recipientId,
    })
    revalidatePath("/dashboard/alias")
    return { alias: { id: alias.id, email: alias.email, organizationId: alias.organizationId } }
  })
}

export async function toggleAliasAction(id: string): Promise<ActionState> {
  return runScopedAction({ rateLimitKey: "recipientOps" }, async (_, scope) => {
    await AliasService.toggleAlias(scope, id)
    revalidatePath("/dashboard/alias")
  })
}

export async function deleteAliasAction(id: string): Promise<ActionState> {
  return runScopedAction({ rateLimitKey: "recipientOps" }, async (_, scope) => {
    await AliasService.deleteAlias(scope, id)
    revalidatePath("/dashboard/alias")
  })
}

export async function updateAliasAction(
  id: string,
  data: { recipientId?: string; recipientIds?: string[] }
): Promise<ActionState> {
  return runScopedAction({
    schema: updateAliasRoutingSchema,
    data,
    rateLimitKey: "recipientOps",
  }, async (validated, scope) => {
    await AliasService.updateAlias(scope, id, validated)
    revalidatePath("/dashboard/alias")
  })
}

// Org-scope ciphertext must name the team key generation it was encrypted with.
const updateAliasMetadataWithGenerationSchema = updateAliasEncryptedMetadataSchema.extend({
  orgKeyGeneration: z.number().int().positive().optional(),
})

export async function updateAliasEncryptedMetadataAction(
  id: string,
  data: {
    encryptedLabel?: string | null
    encryptedNote?: string | null
    clearLegacyLabel?: boolean
    clearLegacyNote?: boolean
    orgKeyGeneration?: number
  }
): Promise<ActionState> {
  // ApiError codes (e.g. ORG_KEY_GENERATION_MISMATCH) pass through
  // runScopedAction, so the client can drop its cached team key and retry.
  return runScopedAction({
    schema: updateAliasMetadataWithGenerationSchema,
    data,
    rateLimitKey: "recipientOps",
  }, async (validated, scope) => {
    await AliasService.updateAlias(scope, id, validated)
    revalidatePath("/dashboard/alias")
  })
}
