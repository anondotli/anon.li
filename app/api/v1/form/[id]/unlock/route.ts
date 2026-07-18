/**
 * POST /api/v1/form/[id]/unlock
 * Verifies a password-derived witness and returns the protected question
 * schema. The raw password never leaves the submitter's browser.
 */

import { apiError, apiSuccess, ErrorCodes, withNoStore, zodErrorToDetails } from "@/lib/api-response"
import { ForbiddenError, NotFoundError } from "@/lib/api-error-utils"
import { getClientIp } from "@/lib/rate-limit"
import { withPolicy } from "@/lib/route-policy"
import { FormService } from "@/lib/services/form"
import { customKeyProofSchema } from "@/lib/validations/form"
import { z } from "zod"

interface RouteParams {
    params: Promise<{ id: string }>
}

const bodySchema = z.object({ customKeyProof: customKeyProofSchema })

export const POST = withPolicy<RouteParams>(
    {
        auth: "none",
        rateLimit: "formUnlock",
        rateLimitIdentifier: async () => getClientIp(),
    },
    async (ctx, routeContext) => {
        const { id } = await routeContext.params
        const body = await ctx.request.json().catch(() => null)
        const parsed = bodySchema.safeParse(body)
        if (!parsed.success) {
            return apiError(
                "Validation failed",
                ErrorCodes.VALIDATION_ERROR,
                ctx.requestId,
                400,
                zodErrorToDetails(parsed.error),
            )
        }

        try {
            const form = await FormService.getPublicForm(id, parsed.data)
            if (!form.customKey || !form.schema) {
                return apiError("Form is not password-protected", ErrorCodes.INVALID_REQUEST, ctx.requestId, 400)
            }
            return withNoStore(apiSuccess({ schema: form.schema }, ctx.requestId))
        } catch (error) {
            if (error instanceof NotFoundError) {
                return apiError(error.message, ErrorCodes.NOT_FOUND, ctx.requestId, 404)
            }
            if (error instanceof ForbiddenError) {
                return apiError("Invalid form password", ErrorCodes.FORBIDDEN, ctx.requestId, 403)
            }
            const status = (error as { status?: number }).status
            if (status === 410) {
                return apiError("Form has been taken down", ErrorCodes.GONE, ctx.requestId, 410)
            }
            throw error
        }
    },
)
