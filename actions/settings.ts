"use server"

import { DeletionService } from "@/lib/services/deletion"
import { runSecureAction, type ActionState } from "@/lib/safe-action"
import { redirect } from "next/navigation"

/**
 * Request account deletion. Initiates the deletion lifecycle:
 * Sessions are revoked immediately, resources are deleted progressively,
 * and the user record is hard-deleted after the backup retention period.
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
