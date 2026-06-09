"use server"

import { revalidatePath } from "next/cache"
import { ApiKeyService } from "@/lib/services/api-key"
import { runScopedAction, type ActionState } from "@/lib/safe-action"
import { z } from "zod"

const createApiKeySchema = z.object({
    label: z.string().trim().min(1, "Label is required").max(100, "Label must be 100 characters or less"),
})

export async function createApiKeyAction(formData: FormData): Promise<ActionState<{ key: string }>> {
    const label = formData.get("label") || "My API Key"

    return runScopedAction(
        { schema: createApiKeySchema, data: { label }, rateLimitKey: "apiKey" },
        async (data, scope) => {
            const key = await ApiKeyService.create(scope, data.label)
            revalidatePath("/dashboard/api-keys")
            return { key }
        }
    )
}

export async function deleteApiKeyAction(id: string): Promise<ActionState> {
    return runScopedAction(
        { rateLimitKey: "apiKey" },
        async (_data, scope) => {
            await ApiKeyService.delete(scope, id)
            revalidatePath("/dashboard/api-keys")
            revalidatePath("/dashboard/settings")
        }
    )
}
