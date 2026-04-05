/**
 * POST /api/v1/recipient/[id]/verify - Resend verification email
 *
 * Authentication: API key only (Bearer ak_...)
 */

import { validateApiKey } from "@/lib/api-auth"
import { createRateLimitHeaders } from "@/lib/api-rate-limit"
import { RecipientService } from "@/lib/services/recipient"
import {
    generateRequestId,
    apiSuccess,
    apiError,
    apiErrorFromUnknown,
    apiRateLimitError,
    withApiHeaders,
    ErrorCodes,
} from "@/lib/api-response"

export const dynamic = 'force-dynamic'

interface RouteParams {
    params: Promise<{ id: string }>
}

/**
 * POST /api/v1/recipient/[id]/verify
 * Resend verification email
 */
export async function POST(req: Request, { params }: RouteParams) {
    const requestId = generateRequestId()
    const { id } = await params

    const result = await validateApiKey(req)
    if (!result) {
        return apiError("Unauthorized - API key required", ErrorCodes.UNAUTHORIZED, requestId, 401)
    }

    if (!result.rateLimit.success) {
        return withApiHeaders(
            apiRateLimitError(requestId, result.rateLimit.reset, true),
            requestId,
            createRateLimitHeaders(result.rateLimit)
        )
    }

    try {
        await RecipientService.resendVerification(result.user.id, id)
        return withApiHeaders(
            apiSuccess({ sent: true }, requestId),
            requestId,
            createRateLimitHeaders(result.rateLimit)
        )
    } catch (error) {
        return apiErrorFromUnknown(error, requestId)
    }
}
