"use server"

import { DeletionService } from "@/lib/services/deletion"
import { runSecureAction, type ActionState } from "@/lib/safe-action"
import { redirect } from "next/navigation"

/**
 * Delete an account immediately from live systems.
 */
export async function deleteAccountAction(): Promise<ActionState> {
    const result = await runSecureAction(
        { rateLimitKey: "auth" },
        async (_data, userId) => {
            await DeletionService.requestDeletion(userId)
        }
    )

    if (result.success) {
        redirect("/")
    }

    return result
}
