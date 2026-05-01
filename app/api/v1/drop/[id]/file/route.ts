/**
 * POST /api/v1/drop/[id]/file
 * Add a file to an existing drop
 */

import { NextResponse } from "next/server"

import { getClientIp, rateLimit } from "@/lib/rate-limit"
import { withPolicy } from "@/lib/route-policy"
import { DropService } from "@/lib/services/drop"
import {
    getFormUploadQuotaOverride,
    resolveTokenUploadAccess,
    validateFormDropFile,
} from "@/lib/services/form-upload"
import { getChunkPresignedUrls } from "@/lib/storage"
import { addFileApiSchema } from "@/lib/validations/drop"

interface RouteParams {
    params: Promise<{ id: string }>
}

export const POST = withPolicy<RouteParams>(
    {
        auth: "optional_api_key_or_session",
        apiQuota: "drop",
        requireCsrf: true,
        checkBan: "upload",
        rateLimit: "fileUploadAuth",
        rateLimitIdentifier: async (ctx) => ctx.userId ?? await getClientIp(),
    },
    async (ctx, routeContext) => {
        const { id: dropId } = await routeContext!.params
        let effectiveUserId = ctx.userId
        let formId: string | null = null
        const hasUploadToken = Boolean(ctx.request.headers.get("x-upload-token"))

        // Guest branch: enforce the stricter per-IP fileUpload limiter (50/h)
        // on top of the withPolicy limiter.
        if (!ctx.userId) {
            const ip = await getClientIp()
            const rateLimited = await rateLimit("fileUpload", ip)
            if (rateLimited) return rateLimited
        }

        if (hasUploadToken) {
            const access = await resolveTokenUploadAccess(ctx.request, dropId)
            if (!access) {
                return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
            }
            effectiveUserId = access.effectiveUserId
            formId = access.formId
        } else if (!ctx.userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const body = await ctx.request.json()
        const validation = addFileApiSchema.safeParse(body)
        if (!validation.success) {
            return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
        }

        let quotaOverride: Awaited<ReturnType<typeof getFormUploadQuotaOverride>> | undefined
        if (formId) {
            await validateFormDropFile(formId, {
                dropId,
                fieldId: validation.data.formFieldId,
                size: validation.data.size,
                mimeType: validation.data.mimeType,
                chunkCount: validation.data.chunkCount,
            })
            quotaOverride = await getFormUploadQuotaOverride(formId)
        }

        const { formFieldId: _formFieldId, ...dropFileInput } = validation.data
        const result = quotaOverride
            ? await DropService.addFile(effectiveUserId, {
                  dropId,
                  ...dropFileInput,
              }, { quotaOverride })
            : await DropService.addFile(effectiveUserId, {
                  dropId,
                  ...dropFileInput,
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
