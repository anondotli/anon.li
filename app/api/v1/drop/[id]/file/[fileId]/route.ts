/**
 * GET /api/v1/drop/[id]/file/[fileId]
 * Validate access and redirect to a presigned R2 download URL.
 * Blob bytes never touch our servers.
 *
 * DELETE /api/v1/drop/[id]/file/[fileId]
 * Abort a multipart upload (merged from file/[fileId]/abort)
 */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { prisma } from "@/lib/prisma"
import { withPolicy } from "@/lib/route-policy"
import { DropService } from "@/lib/services/drop"
import { decrementStorageUsed } from "@/lib/services/drop-storage"
import { resolveTokenUploadAccess } from "@/lib/services/form-upload"
import { getPresignedDownloadUrl, abortMultipartUpload } from "@/lib/storage"
import { getClientIp } from "@/lib/rate-limit"

interface RouteParams {
    params: Promise<{
        id: string
        fileId: string
    }>
}

export const dynamic = "force-dynamic"

const abortSchema = z.object({
    s3UploadId: z.string(),
})

export const GET = withPolicy<RouteParams>(
    {
        auth: "none",
        rateLimit: "download",
        rateLimitIdentifier: async () => getClientIp(),
    },
    async (ctx, routeContext) => {
        const { id: dropId, fileId } = await routeContext!.params
        const request = ctx.request as NextRequest

        const file = await prisma.dropFile.findUnique({
            where: { id: fileId },
            include: {
                drop: {
                    select: {
                        id: true,
                        expiresAt: true,
                        maxDownloads: true,
                        downloads: true,
                        deletedAt: true,
                        disabled: true,
                        uploadComplete: true,
                        takenDown: true,
                        customKey: true,
                    },
                },
            },
        })

        if (!file || file.drop.id !== dropId || file.drop.deletedAt || file.drop.disabled || !file.drop.uploadComplete) {
            return new NextResponse("This file is not available.", { status: 404 })
        }

        if (file.drop.takenDown) {
            return new NextResponse("This content has been removed.", { status: 451 })
        }

        if (file.drop.expiresAt && new Date() > file.drop.expiresAt) {
            return new NextResponse("This file is not available.", { status: 404 })
        }

        if (file.drop.maxDownloads && file.drop.downloads >= file.drop.maxDownloads) {
            return new NextResponse("This file is not available.", { status: 404 })
        }

        const rangeHeader = request.headers.get("Range")
        const isNewDownload = !rangeHeader || rangeHeader === "bytes=0-"

        if (isNewDownload) {
            const counted = await DropService.incrementDownloadCount(dropId)
            if (!counted) {
                return new NextResponse("Download limit reached.", { status: 404 })
            }
        }

        const presignedUrl = await getPresignedDownloadUrl(file.storageKey)
        return NextResponse.redirect(presignedUrl, {
            status: 302,
            headers: {
                "Cache-Control": "no-store, no-cache, must-revalidate",
            },
        })
    },
)

export const DELETE = withPolicy<RouteParams>(
    {
        auth: "optional_api_key_or_session",
        apiQuota: "drop",
        requireCsrf: true,
        rateLimit: "dropAbortUpload",
        rateLimitIdentifier: async (ctx) => ctx.userId ?? await getClientIp(),
    },
    async (ctx, routeContext) => {
        try {
            const { id: dropId, fileId } = await routeContext!.params
            let effectiveUserId = ctx.userId
            const hasUploadToken = Boolean(ctx.request.headers.get("x-upload-token"))

            // Token-bound aborts are bound to the upload token — without a valid
            // token, we reject before touching the database.
            if (hasUploadToken) {
                const access = await resolveTokenUploadAccess(ctx.request, dropId)
                if (!access) {
                    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
                }
                effectiveUserId = access.effectiveUserId
            } else if (!ctx.userId) {
                return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
            }

            const body = await ctx.request.json().catch(() => ({}))
            const validation = abortSchema.safeParse(body)

            if (!validation.success) {
                return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
            }

            const { s3UploadId } = validation.data

            const file = await prisma.dropFile.findUnique({
                where: { id: fileId },
                include: { drop: true },
            })

            if (!file) {
                return NextResponse.json({ success: true })
            }

            if (file.drop.id !== dropId) {
                return NextResponse.json({ error: "File not found" }, { status: 404 })
            }

            if (file.s3UploadId && s3UploadId !== file.s3UploadId) {
                return NextResponse.json({ error: "Unauthorized upload ID" }, { status: 401 })
            }

            // Ownership mode must match: authenticated caller must own the
            // drop; guest caller must be acting on a guest drop (userId null).
            if (effectiveUserId) {
                if (file.drop.userId !== effectiveUserId) {
                    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
                }
            } else if (file.drop.userId !== null) {
                return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
            }

            try {
                await abortMultipartUpload(file.storageKey, s3UploadId)
            } catch {
                // Best effort cleanup only.
            }

            const fileSize = file.size

            await prisma.dropFile.delete({
                where: { id: fileId },
            }).catch(() => {
                // Ignore if already deleted.
            })

            if (effectiveUserId && fileSize > BigInt(0)) {
                try {
                    await decrementStorageUsed(effectiveUserId, fileSize)
                } catch {
                    // Best effort cleanup only.
                }
            }

            return NextResponse.json({ success: true })
        } catch {
            return NextResponse.json({ success: true })
        }
    },
)
