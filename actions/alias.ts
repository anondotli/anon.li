"use server"

import { revalidatePath } from "next/cache"
import { AliasService } from "@/lib/services/alias"
import { runScopedAction, type ActionState } from "@/lib/safe-action"
import { createAliasSchema, updateAliasEncryptedMetadataSchema, updateAliasSchema } from "@/lib/validations/alias"

export async function createAliasAction(data: {
  localPart?: string | null
  domain: string
  format?: "RANDOM" | "CUSTOM"
  recipientId?: string
}): Promise<ActionState<{ alias: { id: string; email: string } }>> {
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
    return { alias: { id: alias.id, email: alias.email } }
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
  data: { recipientId?: string }
): Promise<ActionState> {
  return runScopedAction({
    schema: updateAliasSchema,
    data,
    rateLimitKey: "recipientOps",
  }, async (validated, scope) => {
    await AliasService.updateAlias(scope, id, validated)
    revalidatePath("/dashboard/alias")
  })
}

export async function updateAliasEncryptedMetadataAction(
  id: string,
  data: {
    encryptedLabel?: string | null
    encryptedNote?: string | null
    clearLegacyLabel?: boolean
    clearLegacyNote?: boolean
  }
): Promise<ActionState> {
  return runScopedAction({
    schema: updateAliasEncryptedMetadataSchema,
    data,
    rateLimitKey: "recipientOps",
  }, async (validated, scope) => {
    await AliasService.updateAlias(scope, id, validated)
    revalidatePath("/dashboard/alias")
  })
}
