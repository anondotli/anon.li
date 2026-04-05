"use server"

import { revalidatePath } from "next/cache"
import { ApiKeyService } from "@/lib/services/api-key"
import { runSecureAction, type ActionState } from "@/lib/safe-action"

export async function createApiKeyAction(formData: FormData): Promise<ActionState<{ key: string }>> {
    const label = formData.get("label") as string || "My API Key"

    return runSecureAction(
        { rateLimitKey: "apiKey" },
        async (_data, userId) => {
            const key = await ApiKeyService.create(userId, label)
            revalidatePath("/dashboard/settings/api-keys")
            return { key }
        }
    )
}

export async function deleteApiKeyAction(id: string): Promise<ActionState> {
    return runSecureAction(
        { rateLimitKey: "apiKey" },
        async (_data, userId) => {
            await ApiKeyService.delete(userId, id)
            revalidatePath("/dashboard/settings/api-keys")
            revalidatePath("/dashboard/settings")
        }
    )
}
