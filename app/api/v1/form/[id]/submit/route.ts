/**
 * POST /api/v1/form/[id]/submit — public submission endpoint.
 * Body is hybrid-encrypted ciphertext; server never sees plaintext.
 */

import { apiError, apiSuccess, ErrorCodes, zodErrorToDetails } from "@/lib/api-response"
import { withPolicy } from "@/lib/route-policy"
import { FormService } from "@/lib/services/form"
import { submitFormSchema } from "@/lib/validations/form"
import { getClientIp } from "@/lib/rate-limit"
import { validateTurnstileToken } from "@/lib/turnstile"
import { notifyFormSubmission } from "@/lib/services/form-notifications"
import { ForbiddenError, NotFoundError, ValidationError, UpgradeRequiredError } from "@/lib/api-error-utils"
import { after } from "next/server"
import { rateLimit } from "@/lib/rate-limit"

interface RouteParams {
    params: Promise<{ id: string }>
}

export const POST = withPolicy<RouteParams>(
    {
        auth: "optional_api_key_or_session",
        rateLimit: "formSubmitAuth",
        rateLimitIdentifier: async (ctx) => ctx.userId ?? await getClientIp(),
    },
    async (ctx, routeContext) => {
        const { id } = await routeContext.params
        const limited = await rateLimit("formSubmit", await getClientIp())
        if (limited) return limited
        const body = await ctx.request.json().catch(() => null)
        const parsed = submitFormSchema.safeParse(body)
        if (!parsed.success) {
            return apiError("Validation failed", ErrorCodes.VALIDATION_ERROR, ctx.requestId, 400, zodErrorToDetails(parsed.error))
        }

        // A login belongs to the respondent, not the Form owner, so it must not
        // bypass bot protection on a public target. Attachment submissions reuse
        // the one-time upload token issued after an earlier Turnstile check.
        if (!parsed.data.attachedDropId) {
            if (!parsed.data.turnstileToken) {
                return apiError("Verification required", ErrorCodes.VALIDATION_ERROR, ctx.requestId, 400)
            }
            const isValid = await validateTurnstileToken(parsed.data.turnstileToken)
            if (!isValid) {
                return apiError("Bot verification failed", ErrorCodes.VALIDATION_ERROR, ctx.requestId, 400)
            }
        }

        try {
            const ip = await getClientIp().catch(() => null)
            const submission = await FormService.recordSubmission(id, parsed.data, {
                submitterUserId: ctx.userId ?? null,
                submitterIp: ip,
            })
            // Keep the serverless invocation alive for delivery while preserving
            // the successful submission response if email itself fails.
            after(() => notifyFormSubmission(id, submission.id))
            return apiSuccess({
                id: submission.id,
                created_at: submission.createdAt.toISOString(),
            }, ctx.requestId)
        } catch (error) {
            if (error instanceof NotFoundError) {
                return apiError(error.message, ErrorCodes.NOT_FOUND, ctx.requestId, 404)
            }
            if (error instanceof ForbiddenError) {
                return apiError(error.message, ErrorCodes.FORBIDDEN, ctx.requestId, 403)
            }
            if (error instanceof ValidationError) {
                return apiError(error.message, ErrorCodes.VALIDATION_ERROR, ctx.requestId, 400)
            }
            if (error instanceof UpgradeRequiredError) {
                return apiError(error.message, ErrorCodes.PAYMENT_REQUIRED, ctx.requestId, 402)
            }
            throw error
        }
    },
)
