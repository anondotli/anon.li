/**
 * POST /api/v1/drop/[id]/download
 * Record a download and get signed URLs for all files
 */

import { NextResponse } from "next/server"

import { getClientIp } from "@/lib/rate-limit"
import { withPolicy } from "@/lib/route-policy"
import { DropService } from "@/lib/services/drop"
import { resolveDownloadAccess, consumeRecipientDownload, recordAccessEvent } from "@/lib/services/drop-recipient"
import { getPresignedDownloadUrl, LIMITED_DROP_PRESIGNED_URL_EXPIRES } from "@/lib/storage"
import { prisma } from "@/lib/prisma"

interface RouteParams {
    params: Promise<{ id: string }>
}

export const POST = withPolicy<RouteParams>(
    {
        auth: "none",
        rateLimit: "dropDownload",
        rateLimitIdentifier: async () => getClientIp(),
    },
    async (ctx, routeContext) => {
        const { id: dropId } = await routeContext.params

        const drop = await prisma.drop.findUnique({
            where: { id: dropId },
            include: { files: { select: { id: true, storageKey: true } } },
        })

        if (!drop) {
            return NextResponse.json({ error: "Drop not found" }, { status: 404 })
        }

        if (drop.disabled || drop.takenDown || drop.deletedAt || !drop.uploadComplete) {
            return NextResponse.json({ error: "This drop is not available." }, { status: 404 })
        }

        if (drop.expiresAt && new Date() > drop.expiresAt) {
            return NextResponse.json({ error: "This drop has expired." }, { status: 404 })
        }

        // Per-recipient access gate (zero-knowledge: token gates ciphertext only).
        const recipientToken =
            ctx.request.headers.get("x-drop-recipient") ?? new URL(ctx.request.url).searchParams.get("r")
        const access = await resolveDownloadAccess(dropId, drop.restrictToRecipients, recipientToken)
        if (!access.allowed) {
            return NextResponse.json({ error: "This drop is not available." }, { status: 404 })
        }
        if (access.recipientId) {
            const ok = await consumeRecipientDownload(access.recipientId)
            if (!ok) {
                return NextResponse.json({ error: "Download limit reached." }, { status: 404 })
            }
        }

        if (drop.maxDownloads) {
            const counted = await DropService.incrementDownloadCount(dropId)
            if (!counted) {
                return NextResponse.json({ error: "Download limit reached." }, { status: 404 })
            }
        } else {
            await DropService.incrementDownloadCount(dropId)
        }

        // Limited drops get short-lived URLs so the issued batch can't be replayed
        // long after the count was spent (the byte transfer happens at R2, which
        // we can't count). Unlimited drops keep the default TTL.
        const expiresIn = drop.maxDownloads ? LIMITED_DROP_PRESIGNED_URL_EXPIRES : undefined
        const downloadUrls: Record<string, string> = {}
        for (const file of drop.files) {
            downloadUrls[file.id] = await getPresignedDownloadUrl(file.storageKey, expiresIn)
        }

        // Owner-facing access log: one event for the whole-drop (ZIP) download.
        const userAgent = ctx.request.headers.get("user-agent")
        const clientIp = await getClientIp()
        void recordAccessEvent({
            dropId,
            recipientId: access.recipientId,
            eventType: "zip_all",
            ip: clientIp,
            userAgent,
        })

        return NextResponse.json({ success: true, downloadUrls })
    },
)
