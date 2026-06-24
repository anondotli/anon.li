/**
 * DELETE /api/v1/drop/[id]/recipients/[recipientId]
 * Revoke a single recipient's future access (owner only). Idempotent. Cannot
 * un-share data the recipient already downloaded.
 */

import { NextResponse } from "next/server"

import { withPolicy, scopeFromContext } from "@/lib/route-policy"
import { DropService } from "@/lib/services/drop"

interface RouteParams {
    params: Promise<{ id: string; recipientId: string }>
}

export const DELETE = withPolicy<RouteParams>(
    {
        auth: "api_key_or_session",
        apiQuota: "drop",
        requireCsrf: true,
        rateLimit: "dropOps",
    },
    async (ctx, routeContext) => {
        const { id: dropId, recipientId } = await routeContext.params
        await DropService.revokeRecipient(scopeFromContext(ctx), dropId, recipientId)
        return NextResponse.json({ success: true })
    },
)
