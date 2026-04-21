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

import { getClientIp, rateLimit } from "@/lib/rate-limit"
import { withPolicy } from "@/lib/route-policy"
import { DropService } from "@/lib/services/drop"
import { verifyUploadToken } from "@/lib/services/drop-upload-token"
import { getPublicDropMetadata } from "@/lib/drop-metadata"

interface RouteParams {
    params: Promise<{ id: string }>
}

const completeDropSchema = z.object({}).strict()

const finishDropSchema = z.object({
    files: z.array(z.object({
        fileId: z.string().min(1),
        chunks: z.array(z.object({
            chunkIndex: z.number().int().min(0),
            etag: z.string().min(1),
        })).min(1).max(10_000),
    })).min(1).max(100),
})

const getHandler = withPolicy<RouteParams>(
    {
        auth: "none",
        rateLimit: "dropMetadata",
        rateLimitIdentifier: async () => getClientIp(),
    },
    async (_ctx, routeContext) => {
        const { id: dropId } = await routeContext!.params
        const clientIp = await getClientIp()

        const perDropLimited = await rateLimit("dropMetadataPerDrop", `${clientIp}:${dropId}`)
        if (perDropLimited) {
            return perDropLimited
        }

        const drop = await getPublicDropMetadata(dropId)
        if (!drop) {
            return NextResponse.json({ error: "Drop not found" }, { status: 404 })
        }

        return NextResponse.json(drop)
    },
)

export const GET = getHandler

export const DELETE = withPolicy<RouteParams>(
    {
        auth: "api_key_or_session",
        apiQuota: "drop",
        requireCsrf: true,
        rateLimit: "dropOps",
    },
    async (ctx, routeContext) => {
        const { id: dropId } = await routeContext!.params

        await DropService.deleteDrop(dropId, ctx.userId!)

        return NextResponse.json({ success: true })
    },
)

const completeHandler = withPolicy<RouteParams>(
    {
        auth: "api_key_or_session",
        apiQuota: "drop",
        requireCsrf: true,
        checkBan: "upload",
        rateLimit: "dropOps",
    },
    async (ctx, routeContext) => {
        const { id: dropId } = await routeContext!.params
        const body = await ctx.request.json().catch(() => ({}))
        const validation = completeDropSchema.safeParse(body)

        if (!validation.success) {
            return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
        }

        await DropService.completeDrop(dropId, ctx.userId!)
        return NextResponse.json({ success: true })
    },
)

const finishHandler = withPolicy<RouteParams>(
    {
        auth: "optional_api_key_or_session",
        apiQuota: "drop",
        requireCsrf: true,
        checkBan: "upload",
        rateLimit: "dropOps",
        rateLimitIdentifier: async (ctx) => ctx.userId ?? await getClientIp(),
    },
    async (ctx, routeContext) => {
        const { id: dropId } = await routeContext!.params

        if (!ctx.userId) {
            const ok = await verifyUploadToken(ctx.request, dropId)
            if (!ok) {
                return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
            }
        }

        const body = await ctx.request.json().catch(() => ({}))
        const validation = finishDropSchema.safeParse(body)

        if (!validation.success) {
            return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
        }

        await DropService.finishDrop(dropId, validation.data.files, ctx.userId)
        return NextResponse.json({ success: true })
    },
)

const toggleHandler = withPolicy<RouteParams>(
    {
        auth: "api_key_or_session",
        apiQuota: "drop",
        requireCsrf: true,
        rateLimit: "dropOps",
    },
    async (ctx, routeContext) => {
        const { id: dropId } = await routeContext!.params
        const disabled = await DropService.toggleDrop(dropId, ctx.userId!)

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

    return NextResponse.json(
        { error: "Invalid action. Use ?action=complete, ?action=toggle, or ?action=finish" },
        { status: 400 },
    )
}
