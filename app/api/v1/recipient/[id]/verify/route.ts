/**
 * POST /api/v1/recipient/[id]/verify - Resend verification email
 *
 * Authentication: API key only (Bearer ak_...)
 */

import { apiError, apiSuccess, ErrorCodes } from "@/lib/api-response"
import { withPolicy } from "@/lib/route-policy"
import { RecipientService } from "@/lib/services/recipient"

export const dynamic = "force-dynamic"

interface RouteParams {
    params: Promise<{ id: string }>
}

export const POST = withPolicy<RouteParams>(
    {
        auth: "api_key",
        requireCsrf: true,
        rateLimit: "emailResend",
    },
    async (ctx, routeContext) => {
        if (!ctx.userId) {
            return apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, ctx.requestId, 401)
        }

        const { id } = await routeContext!.params
        await RecipientService.resendVerification(ctx.userId, id)
        return apiSuccess({ sent: true }, ctx.requestId)
    },
)
