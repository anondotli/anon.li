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
import { deletePendingDropFileAndReleaseQuota } from "@/lib/services/drop-storage"
import { resolveDownloadAccess, recordAccessEvent } from "@/lib/services/drop-recipient"
import { resolveTokenUploadAccess } from "@/lib/services/form-upload"
import {
    getPresignedDownloadUrl,
    abortMultipartUpload,
    deleteObject,
    LIMITED_DROP_PRESIGNED_URL_EXPIRES,
} from "@/lib/storage"
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
        // A Range request may skip an unlimited anonymous *statistics* count,
        // but it must never bypass either a global or per-recipient allowance.
        const shouldCount = file.drop.maxDownloads != null || access.recipientId != null || !isResumeRange

        // Presign before spending any allowance. The URL stays server-side until
        // the atomic counter transaction succeeds, so a signing failure burns
        // neither the global nor recipient count.
        const presignedUrl = await getPresignedDownloadUrl(
            file.storageKey,
            file.drop.maxDownloads != null || access.recipientId != null
                ? LIMITED_DROP_PRESIGNED_URL_EXPIRES
                : undefined,
        )

        if (shouldCount) {
            const counted = await DropService.consumeDownload(dropId, access.recipientId)
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

        // The browser client asks for JSON so it can make a fresh, credential-
        // free request to R2. A cross-origin redirect could otherwise forward
        // X-Drop-Recipient to the storage endpoint. Preserve redirect behavior
        // for simple link/API clients that do not request JSON.
        const wantsJson = request.headers.get("accept")?.includes("application/json")
            || request.headers.has("x-drop-recipient")
        if (wantsJson) {
            return NextResponse.json(
                { url: presignedUrl },
                {
                    headers: {
                        "Cache-Control": "no-store, no-cache, must-revalidate",
                        "Referrer-Policy": "no-referrer",
                    },
                },
            )
        }

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
        organizationAccess: "subscribed",
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

            // Claim the still-pending row before touching storage. A finalizer
            // that already committed uploadComplete wins atomically; returning
            // null makes this abort a successful no-op with no stale-key delete.
            const claimed = await deletePendingDropFileAndReleaseQuota(fileId)
            if (!claimed) {
                return NextResponse.json({ success: true })
            }

            if (claimed.s3UploadId) {
                await abortMultipartUpload(claimed.storageKey, claimed.s3UploadId).catch(() => {
                    // It may already have completed; reconcile the object below.
                })
            }

            // A multipart completion can reach storage before its final DB
            // update. Delete any such reconciled object and persist a retry if
            // object storage is temporarily unavailable.
            await deleteObject(claimed.storageKey).catch(async () => {
                await prisma.orphanedFile.create({
                    data: { storageKey: claimed.storageKey },
                }).catch(() => undefined)
            })

            return NextResponse.json({ success: true })
        } catch {
            return NextResponse.json({ success: true })
        }
    },
)
