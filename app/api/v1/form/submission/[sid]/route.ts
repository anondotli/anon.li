/**
 * GET /api/v1/form/submission/[sid]  — fetch ciphertext (creator only, read-only).
 * PATCH /api/v1/form/submission/[sid] — mark the submission read.
 * DELETE /api/v1/form/submission/[sid] — remove submission and attached drop.
 */

import { apiError, apiSuccess, ErrorCodes } from "@/lib/api-response"
import { withPolicy, scopeFromContext } from "@/lib/route-policy"
import { FormService } from "@/lib/services/form"
import { NotFoundError, ForbiddenError } from "@/lib/api-error-utils"
import { SubmissionId } from "@/lib/validations/form"

interface RouteParams {
    params: Promise<{ sid: string }>
}

export const GET = withPolicy<RouteParams>(
    {
        auth: "api_key_or_session",
        organizationAccess: "subscribed",
        apiQuota: "form",
        rateLimit: "formSubmissionRead",
    },
    async (ctx, routeContext) => {
        const { sid: rawSid } = await routeContext.params
        const parsedId = SubmissionId.safeParse(rawSid)
        if (!parsedId.success) {
            return apiError("Invalid submission ID", ErrorCodes.VALIDATION_ERROR, ctx.requestId, 400)
        }
        const sid = parsedId.data
        try {
            const submission = await FormService.getSubmission(sid, scopeFromContext(ctx))
            return apiSuccess({
                id: submission.id,
                ephemeral_pub_key: submission.ephemeralPubKey,
                iv: submission.iv,
                encrypted_payload: submission.encryptedPayload,
                attached_drop_id: submission.attachedDropId,
                created_at: submission.createdAt.toISOString(),
                read_at: submission.readAt?.toISOString() ?? null,
            }, ctx.requestId)
        } catch (error) {
            if (error instanceof NotFoundError) {
                return apiError(error.message, ErrorCodes.NOT_FOUND, ctx.requestId, 404)
            }
            if (error instanceof ForbiddenError) {
                return apiError(error.message, ErrorCodes.FORBIDDEN, ctx.requestId, 403)
            }
            throw error
        }
    },
)

export const PATCH = withPolicy<RouteParams>(
    {
        auth: "api_key_or_session",
        organizationAccess: "subscribed",
        apiQuota: "form",
        requireCsrf: true,
        rateLimit: "formOps",
    },
    async (ctx, routeContext) => {
        const { sid: rawSid } = await routeContext.params
        const parsedId = SubmissionId.safeParse(rawSid)
        if (!parsedId.success) {
            return apiError("Invalid submission ID", ErrorCodes.VALIDATION_ERROR, ctx.requestId, 400)
        }
        const sid = parsedId.data
        try {
            const readAt = await FormService.markSubmissionRead(sid, scopeFromContext(ctx))
            return apiSuccess({ id: sid, read_at: readAt.toISOString() }, ctx.requestId)
        } catch (error) {
            if (error instanceof NotFoundError) {
                return apiError(error.message, ErrorCodes.NOT_FOUND, ctx.requestId, 404)
            }
            if (error instanceof ForbiddenError) {
                return apiError(error.message, ErrorCodes.FORBIDDEN, ctx.requestId, 403)
            }
            throw error
        }
    },
)

export const DELETE = withPolicy<RouteParams>(
    {
        auth: "api_key_or_session",
        organizationAccess: "subscribed",
        apiQuota: "form",
        requireCsrf: true,
        rateLimit: "formOps",
    },
    async (ctx, routeContext) => {
        const { sid: rawSid } = await routeContext.params
        const parsedId = SubmissionId.safeParse(rawSid)
        if (!parsedId.success) {
            return apiError("Invalid submission ID", ErrorCodes.VALIDATION_ERROR, ctx.requestId, 400)
        }
        const sid = parsedId.data
        try {
            await FormService.deleteSubmission(sid, scopeFromContext(ctx))
            return apiSuccess({ deleted: true, id: sid }, ctx.requestId)
        } catch (error) {
            if (error instanceof NotFoundError) {
                return apiError(error.message, ErrorCodes.NOT_FOUND, ctx.requestId, 404)
            }
            if (error instanceof ForbiddenError) {
                return apiError(error.message, ErrorCodes.FORBIDDEN, ctx.requestId, 403)
            }
            throw error
        }
    },
)
