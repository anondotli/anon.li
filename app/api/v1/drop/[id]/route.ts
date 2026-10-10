/**
 * GET /api/v1/drop/[id]
 * Get drop metadata and files for download
 *
 * DELETE /api/v1/drop/[id]
 * Delete a drop (owner only)
 *
 * PATCH /api/v1/drop/[id]?action=complete|toggle|finish
 * Complete a drop, toggle its disabled state, or batch finalize
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, ErrorCodes, generateRequestId } from "@/lib/api-response"
import { getClientIp, rateLimit } from "@/lib/rate-limit"
import { withPolicy, scopeFromContext } from "@/lib/route-policy"
import { type OwnerScope } from "@/lib/ownership"
import { DropService } from "@/lib/services/drop"
import { resolveTokenUploadAccess, scopeForTokenUploadAccess } from "@/lib/services/form-upload"
import { getPublicDropMetadata } from "@/lib/drop-metadata"
import { MAX_CHUNKS_PER_FILE } from "@/lib/constants"

interface RouteParams {
    params: Promise<{ id: string }>
}

const completeDropSchema = z.object({}).strict()

const finishDropSchema = z.object({
    files: z.array(z.object({
        fileId: z.string().min(1).max(64),
        chunks: z.array(z.object({
            chunkIndex: z.number().int().min(0),
            etag: z.string().min(1).max(256),
        }).strict()).min(1).max(MAX_CHUNKS_PER_FILE),
    }).strict()).min(1).max(50),
}).strict()

const getHandler = withPolicy<RouteParams>(
    {
        auth: "none",
        rateLimit: "dropMetadata",
        rateLimitIdentifier: async () => getClientIp(),
    },
    async (ctx, routeContext) => {
        const { id: dropId } = await routeContext.params
        const clientIp = await getClientIp()

        const perDropLimited = await rateLimit("dropMetadataPerDrop", `${clientIp}:${dropId}`)
        if (perDropLimited) {
            return perDropLimited
        }

        const drop = await getPublicDropMetadata(dropId)
        if (!drop) {
            return apiError("Drop not found", ErrorCodes.NOT_FOUND, ctx.requestId, 404)
        }

        return NextResponse.json(drop)
    },
)

export const GET = getHandler

export const DELETE = withPolicy<RouteParams>(
    {
        auth: "api_key_or_session",
        organizationAccess: "subscribed",
        apiQuota: "drop",
        requireCsrf: true,
        rateLimit: "dropOps",
    },
    async (ctx, routeContext) => {
        const { id: dropId } = await routeContext.params

        // The public API manages standalone drops only (matching GET /api/v1/drop):
        // form attachment/staging drops belong to their form, and soft-deleted
        // drops are gone — both answer 404.
        await DropService.deleteDrop(dropId, scopeFromContext(ctx), { standaloneOnly: true })

        return NextResponse.json({ success: true })
    },
)

const completeHandler = withPolicy<RouteParams>(
    {
        auth: "api_key_or_session",
        organizationAccess: "subscribed",
        apiQuota: "drop",
        requireCsrf: true,
        checkBan: "upload",
        rateLimit: "dropOps",
    },
    async (ctx, routeContext) => {
        const { id: dropId } = await routeContext.params
        const body = await ctx.request.json().catch(() => null)
        const validation = completeDropSchema.safeParse(body)

        if (!validation.success) {
            return apiError("Invalid request body", ErrorCodes.VALIDATION_ERROR, ctx.requestId, 400)
        }

        await DropService.completeDrop(dropId, scopeFromContext(ctx))
        return NextResponse.json({ success: true })
    },
)

const finishHandler = withPolicy<RouteParams>(
    {
        auth: "optional_api_key_or_session",
        organizationAccess: "subscribed",
        apiQuota: "drop",
        requireCsrf: true,
        checkBan: "upload",
        rateLimit: "dropOps",
        rateLimitIdentifier: async (ctx) => ctx.userId ?? await getClientIp(),
    },
    async (ctx, routeContext) => {
        const { id: dropId } = await routeContext.params
        // Session caller → org-aware scope; token caller → the token owner's scope; guest → null.
        let finishScope: OwnerScope | null = ctx.userId ? scopeFromContext(ctx) : null
        const hasUploadToken = Boolean(ctx.request.headers.get("x-upload-token"))

        if (hasUploadToken) {
            const access = await resolveTokenUploadAccess(ctx.request, dropId)
            if (!access) {
                return apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, ctx.requestId, 401)
            }
            finishScope = scopeForTokenUploadAccess(access)
        } else if (!ctx.userId) {
            return apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, ctx.requestId, 401)
        }

        const body = await ctx.request.json().catch(() => null)
        const validation = finishDropSchema.safeParse(body)

        if (!validation.success) {
            return apiError("Invalid request body", ErrorCodes.VALIDATION_ERROR, ctx.requestId, 400)
        }

        await DropService.finishDrop(dropId, validation.data.files, finishScope)
        return NextResponse.json({ success: true })
    },
)

const toggleHandler = withPolicy<RouteParams>(
    {
        auth: "api_key_or_session",
        organizationAccess: "subscribed",
        apiQuota: "drop",
        requireCsrf: true,
        rateLimit: "dropOps",
    },
    async (ctx, routeContext) => {
        const { id: dropId } = await routeContext.params
        const disabled = await DropService.toggleDrop(dropId, scopeFromContext(ctx), { standaloneOnly: true })

        return NextResponse.json({ success: true, disabled })
    },
)

export async function PATCH(request: Request, routeContext: RouteParams) {
    const action = new URL(request.url).searchParams.get("action")

    if (action === "complete") {
        return completeHandler(request, routeContext)
    }

    if (action === "finish") {
        return finishHandler(request, routeContext)
    }

    if (action === "toggle") {
        return toggleHandler(request, routeContext)
    }

    // Outside withPolicy, so mint the request id here.
    return apiError(
        "Invalid action. Use ?action=complete, ?action=toggle, or ?action=finish",
        ErrorCodes.INVALID_REQUEST,
        generateRequestId(),
        400,
    )
}
