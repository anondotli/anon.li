"use server"

import { revalidatePath } from "next/cache"
import { AliasService } from "@/lib/services/alias"
import { runSecureAction, type ActionState } from "@/lib/safe-action"
import { createAliasSchema, updateAliasSchema } from "@/lib/validations/alias"

export async function createAliasAction(data: {
  localPart?: string | null
  domain: string
  format?: "RANDOM" | "CUSTOM"
  recipientId?: string
  label?: string
}): Promise<ActionState> {
  return runSecureAction({
    schema: createAliasSchema,
    data,
    rateLimitKey: "aliasCreate",
  }, async (validated, userId) => {
    const alias = await AliasService.createAlias(userId, {
      localPart: validated.localPart ?? undefined,
      domain: validated.domain,
      format: validated.format,
      recipientId: validated.recipientId,
      label: validated.label,
    })
    revalidatePath("/dashboard/alias")
    return { alias: { id: alias.id, email: alias.email } }
  })
}

export async function toggleAliasAction(id: string): Promise<ActionState> {
  return runSecureAction({ rateLimitKey: "recipientOps" }, async (_, userId) => {
    await AliasService.toggleAlias(userId, id)
    revalidatePath("/dashboard/alias")
  })
}

export async function deleteAliasAction(id: string): Promise<ActionState> {
  return runSecureAction({ rateLimitKey: "recipientOps" }, async (_, userId) => {
    await AliasService.deleteAlias(userId, id)
    revalidatePath("/dashboard/alias")
  })
}

export async function updateAliasAction(
  id: string,
  data: { label?: string | null; note?: string | null; recipientId?: string }
): Promise<ActionState> {
  return runSecureAction({
    schema: updateAliasSchema,
    data,
    rateLimitKey: "recipientOps",
  }, async (validated, userId) => {
    await AliasService.updateAlias(userId, id, validated)
    revalidatePath("/dashboard/alias")
  })
}
