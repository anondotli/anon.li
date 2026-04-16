/**
 * POST /api/v1/drop/[id]/file
 * Add a file to an existing drop
 */

import { NextResponse } from "next/server"

import { getDropLimits } from "@/lib/limits"
import { prisma } from "@/lib/prisma"
import { withPolicy } from "@/lib/route-policy"
import { DropService } from "@/lib/services/drop"
import { getChunkPresignedUrls } from "@/lib/storage"
import { addFileApiSchema } from "@/lib/validations/drop"

interface RouteParams {
    params: Promise<{ id: string }>
}

export const POST = withPolicy<RouteParams>(
    {
        auth: "api_key_or_session",
        apiQuota: "drop",
        requireCsrf: true,
        checkBan: "upload",
        rateLimit: "fileUploadAuth",
    },
    async (ctx, routeContext) => {
        const { id: dropId } = await routeContext!.params
        const userId = ctx.userId!

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                stripePriceId: true,
                stripeCurrentPeriodEnd: true,
                storageUsed: true,
            },
        })

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const body = await ctx.request.json()
        const validation = addFileApiSchema.safeParse(body)
        if (!validation.success) {
            return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
        }

        const limits = getDropLimits(user)
        const storageUsed = user.storageUsed || BigInt(0)
        const storageLimit = BigInt(limits.maxStorage)
        const newTotal = storageUsed + BigInt(validation.data.size)

        if (newTotal > storageLimit) {
            return NextResponse.json(
                {
                    error: "Storage quota exceeded",
                    code: "QUOTA_EXCEEDED",
                    storage: {
                        used: storageUsed.toString(),
                        limit: storageLimit.toString(),
                    },
                },
                { status: 402 },
            )
        }

        const result = await DropService.addFile(userId, {
            dropId,
            ...validation.data,
        })

        const partNumbers = Array.from({ length: validation.data.chunkCount }, (_, index) => index + 1)
        const uploadUrls = await getChunkPresignedUrls(result.storageKey, result.s3UploadId, partNumbers)

        return NextResponse.json({
            fileId: result.fileId,
            s3UploadId: result.s3UploadId,
            uploadUrls,
        })
    },
)
