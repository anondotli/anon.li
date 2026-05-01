/**
 * GET /api/v1/form/submission/[sid]  — fetch ciphertext (creator only).
 * DELETE /api/v1/form/submission/[sid] — remove submission and attached drop.
 */

import { apiError, apiSuccess, ErrorCodes } from "@/lib/api-response"
import { withPolicy } from "@/lib/route-policy"
import { FormService } from "@/lib/services/form"
import { NotFoundError, ForbiddenError } from "@/lib/api-error-utils"

interface RouteParams {
    params: Promise<{ sid: string }>
}

export const GET = withPolicy<RouteParams>(
    {
        auth: "api_key_or_session",
        apiQuota: "form",
        rateLimit: "formSubmissionRead",
    },
    async (ctx, routeContext) => {
        const { sid } = await routeContext!.params
        const url = new URL(ctx.request.url)
        const markRead = url.searchParams.get("markRead") !== "false"
        try {
            const submission = await FormService.getSubmission(sid, ctx.userId!, { markRead })
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

export const DELETE = withPolicy<RouteParams>(
    {
        auth: "api_key_or_session",
        apiQuota: "form",
        requireCsrf: true,
        rateLimit: "formOps",
    },
    async (ctx, routeContext) => {
        const { sid } = await routeContext!.params
        try {
            await FormService.deleteSubmission(sid, ctx.userId!)
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
