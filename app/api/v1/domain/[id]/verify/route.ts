/**
 * POST /api/v1/domain/[id]/verify - Verify domain DNS records
 *
 * Authentication: API key only (Bearer ak_...)
 */

import { validateApiKey } from "@/lib/api-auth"
import { createRateLimitHeaders } from "@/lib/api-rate-limit"
import { DomainService } from "@/lib/services/domain"
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
 * POST /api/v1/domain/[id]/verify
 * Verify domain DNS records
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
        const verification = await DomainService.verifyDomain(result.user.id, id)

        return withApiHeaders(
            apiSuccess({
                verified: verification.verified,
                ownership_verified: verification.ownershipVerified,
                mx_verified: verification.mxVerified,
                spf_verified: verification.spfVerified,
                dkim_verified: verification.dkimVerified,
                dns_verified: verification.dnsVerified,
            }, requestId),
            requestId,
            createRateLimitHeaders(result.rateLimit)
        )
    } catch (error) {
        return apiErrorFromUnknown(error, requestId)
    }
}
