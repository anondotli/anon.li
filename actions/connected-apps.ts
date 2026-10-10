"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { runSecureAction, type ActionState } from "@/lib/safe-action"
import { revokeConnectedApp } from "@/lib/services/connected-apps"

// DCR client IDs are opaque strings; CIMD client IDs are HTTPS URLs.
const revokeConnectedAppSchema = z.object({
    clientId: z.string().min(1, "Invalid app").max(2048, "Invalid app"),
})

/** Revoke an OAuth/MCP client's access to the signed-in user's account. */
export async function revokeConnectedAppAction(clientId: string): Promise<ActionState> {
    return runSecureAction(
        { schema: revokeConnectedAppSchema, data: { clientId }, rateLimitKey: "connectedAppRevoke" },
        async ({ clientId: validClientId }, userId) => {
            await revokeConnectedApp(userId, validClientId)
            revalidatePath("/dashboard/settings")
        },
    )
}
