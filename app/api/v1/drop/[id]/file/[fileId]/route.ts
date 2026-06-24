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
import { resolveDownloadAccess, consumeRecipientDownload, recordAccessEvent } from "@/lib/services/drop-recipient"
import { resolveTokenUploadAccess } from "@/lib/services/form-upload"
import { getPresignedDownloadUrl, abortMultipartUpload, LIMITED_DROP_PRESIGNED_URL_EXPIRES } from "@/lib/storage"
import { getClientIp } from "@/lib/rate-limit"

/** Per-recipient access token: header (set by the web client) or `?r=` fallback. */
function getRecipientToken(request: NextRequest): string | null {
    return request.headers.get("x-drop-recipient") ?? new URL(request.url).searchParams.get("r")
}

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
        const { id: dropId, fileId } = await routeContext.params
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
                        restrictToRecipients: true,
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

        // Per-recipient access gate. Anonymous (non-restricted) drops are
        // unaffected; restricted drops require a valid, non-revoked recipient
        // token. The token never carries the decryption key — it only authorizes
        // release of the ciphertext URL, so zero-knowledge is preserved.
        const recipientToken = getRecipientToken(request)
        const access = await resolveDownloadAccess(dropId, file.drop.restrictToRecipients, recipientToken)
        if (!access.allowed) {
            return new NextResponse("This file is not available.", { status: 404 })
        }

        const rangeHeader = request.headers.get("Range")
        const isResumeRange = Boolean(rangeHeader) && rangeHeader !== "bytes=0-"

        // Counting model (intentional): this per-file route consumes one download
        // per file fetched, while the batch route (POST /api/v1/drop/[id]/download,
        // used by "download all as ZIP") consumes one for the whole drop. The two
        // map to the two access patterns — pulling a single file vs. the whole drop.
        //
        // For download-limited drops, every issuance of a working presigned URL
        // must consume a download. The Range header we receive is NOT forwarded to
        // R2 (we redirect to a full-object presigned URL), so gating the counter on
        // its absence would let a client send `Range: bytes=1-` to fetch the whole
        // file without incrementing — defeating the limit. For unlimited drops the
        // count is only a stat, so we keep the resume-friendly behavior there and
        // avoid double-counting a resumed transfer.
        const shouldCount = file.drop.maxDownloads ? true : !isResumeRange

        if (shouldCount) {
            // Per-recipient cap (atomic) is consumed first as the cheaper guard;
            // it also stamps the recipient's lastAccessAt.
            if (access.recipientId) {
                const ok = await consumeRecipientDownload(access.recipientId)
                if (!ok) {
                    return new NextResponse("Download limit reached.", { status: 404 })
                }
            }
            const counted = await DropService.incrementDownloadCount(dropId)
            if (!counted) {
                return new NextResponse("Download limit reached.", { status: 404 })
            }

            // Owner-facing access log (fire-and-forget; mirrors lib/services/audit).
            const userAgent = request.headers.get("user-agent")
            const clientIp = await getClientIp()
            void recordAccessEvent({
                dropId,
                recipientId: access.recipientId,
                fileId,
                eventType: "download",
                ip: clientIp,
                userAgent,
            })
        }

        // Limited drops get a short-lived URL so an issued download can't be
        // replayed long after the count was spent (see the constant's docs).
        const presignedUrl = await getPresignedDownloadUrl(
            file.storageKey,
            file.drop.maxDownloads ? LIMITED_DROP_PRESIGNED_URL_EXPIRES : undefined,
        )
        return NextResponse.redirect(presignedUrl, {
            status: 302,
            headers: {
                "Cache-Control": "no-store, no-cache, must-revalidate",
                // Defense in depth: never leak a `?r=` token to R2 via Referer.
                "Referrer-Policy": "no-referrer",
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
            const { id: dropId, fileId } = await routeContext.params
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
