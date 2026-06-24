/**
 * GET  /api/v1/drop/[id]/recipients
 *   List a drop's named recipients (owner only). Access tokens are never returned.
 *
 * POST /api/v1/drop/[id]/recipients
 *   Add recipients and/or toggle "restrict downloads to named recipients".
 *   Returns each new recipient's raw access token ONCE so the caller can build the
 *   share link with the decryption key in the fragment — the server never sees it.
 */

import { NextResponse } from "next/server"

import { withPolicy, scopeFromContext } from "@/lib/route-policy"
import { DropService } from "@/lib/services/drop"
import { addRecipientsSchema } from "@/lib/validations/drop"

interface RouteParams {
    params: Promise<{ id: string }>
}

export const GET = withPolicy<RouteParams>(
    {
        auth: "api_key_or_session",
        apiQuota: "drop",
        rateLimit: "dropOps",
    },
    async (ctx, routeContext) => {
        const { id: dropId } = await routeContext.params
        const recipients = await DropService.listRecipients(scopeFromContext(ctx), dropId)
        return NextResponse.json({ recipients })
    },
)

export const POST = withPolicy<RouteParams>(
    {
        auth: "api_key_or_session",
        apiQuota: "drop",
        requireCsrf: true,
        rateLimit: "dropOps",
    },
    async (ctx, routeContext) => {
        const { id: dropId } = await routeContext.params
        const body = await ctx.request.json().catch(() => ({}))
        const parsed = addRecipientsSchema.safeParse({ ...body, dropId })
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
        }

        const recipients = await DropService.addRecipients(
            scopeFromContext(ctx),
            dropId,
            parsed.data.recipients.map((r) => ({
                email: r.email,
                label: r.label ?? null,
                maxDownloads: r.maxDownloads ?? null,
                expiresAt: r.expiresAt ? new Date(r.expiresAt) : null,
            })),
            { restrict: parsed.data.restrict },
        )
        return NextResponse.json({ recipients })
    },
)
