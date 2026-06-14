"use server"

import { auth } from "@/auth"
import { DeletionService } from "@/lib/services/deletion"
import { runSecureAction, type ActionState } from "@/lib/safe-action"
import { redirect } from "next/navigation"

/**
 * Delete an account immediately from live systems.
 */
export async function deleteAccountAction(): Promise<ActionState> {
    // Surface a clear, actionable message when the user is the sole owner of a
    // team (the deletion service also hard-blocks this as a safety net).
    const session = await auth()
    if (session?.user?.id) {
        const soleOwnerOrgs = await DeletionService.findSoleOwnerOrganizations(session.user.id)
        if (soleOwnerOrgs.length > 0) {
            const names = soleOwnerOrgs.map((o) => o.name).join(", ")
            return {
                error: `You're the sole owner of ${names}. Transfer ownership to another member, or delete the team, before deleting your account.`,
            }
        }
    }

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
