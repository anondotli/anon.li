/**
 * POST /api/v1/drop/[id]/download
 * Record a download and get signed URLs for all files
 */

import { NextResponse } from "next/server"

import { getClientIp } from "@/lib/rate-limit"
import { withPolicy } from "@/lib/route-policy"
import { DropService } from "@/lib/services/drop"
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
    async (_ctx, routeContext) => {
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

        return NextResponse.json({ success: true, downloadUrls })
    },
)
