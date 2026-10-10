/**
 * POST /api/v1/drop/[id]/file
 * Add a file to an existing drop
 */

import { NextResponse } from "next/server"

import { apiError, ErrorCodes } from "@/lib/api-response"
import { getClientIp, rateLimit } from "@/lib/rate-limit"
import { withPolicy, scopeFromContext } from "@/lib/route-policy"
import { type OwnerScope } from "@/lib/ownership"
import { DropService } from "@/lib/services/drop"
import {
    getFormUploadQuotaOverride,
    resolveTokenUploadAccess,
    scopeForTokenUploadAccess,
    validateFormDropFile,
} from "@/lib/services/form-upload"
import { buildMultipartUploadParts, getChunkPresignedUrls } from "@/lib/storage"
import { addFileApiSchema } from "@/lib/validations/drop"

interface RouteParams {
    params: Promise<{ id: string }>
}

export const POST = withPolicy<RouteParams>(
    {
        auth: "optional_api_key_or_session",
        organizationAccess: "subscribed",
        apiQuota: "drop",
        requireCsrf: true,
        checkBan: "upload",
        rateLimit: "fileUploadAuth",
        rateLimitIdentifier: async (ctx) => ctx.userId ?? await getClientIp(),
    },
    async (ctx, routeContext) => {
        const { id: dropId } = await routeContext.params
        // Session caller → org-aware scope; token caller → the token owner's scope; guest → null.
        let uploadScope: OwnerScope | null = ctx.userId ? scopeFromContext(ctx) : null
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
                return apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, ctx.requestId, 401)
            }
            uploadScope = scopeForTokenUploadAccess(access)
            formId = access.formId
        } else if (!ctx.userId) {
            return apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, ctx.requestId, 401)
        }

        const body = await ctx.request.json().catch(() => null)
        const validation = addFileApiSchema.safeParse(body)
        if (!validation.success) {
            return apiError("Invalid request body", ErrorCodes.VALIDATION_ERROR, ctx.requestId, 400)
        }

        const uploadParts = buildMultipartUploadParts(
            validation.data.size,
            validation.data.chunkSize,
            validation.data.chunkCount,
        )

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
        // Form-token uploads act under the form owner's scope but are made by
        // anonymous visitors, so they must not touch the owner's own
        // incomplete-drop allowance.
        const result = formId
            ? await DropService.addFile(uploadScope, {
                  dropId,
                  ...dropFileInput,
              }, { tokenAuthorized: true, quotaOverride })
            : await DropService.addFile(uploadScope, {
                  dropId,
                  ...dropFileInput,
              })

        let uploadUrls: Record<number, string>
        try {
            uploadUrls = await getChunkPresignedUrls(result.storageKey, result.s3UploadId, uploadParts)
        } catch (error) {
            // No identifiers have reached the client, so compensate here or the
            // multipart upload and ciphertext quota would remain stranded.
            await DropService.rollbackProvisionedFile(result)
            throw error
        }

        return NextResponse.json(
            {
                fileId: result.fileId,
                s3UploadId: result.s3UploadId,
                uploadUrls,
            },
            {
                headers: {
                    "Cache-Control": "no-store, max-age=0",
                    "Referrer-Policy": "no-referrer",
                },
            },
        )
    },
)
