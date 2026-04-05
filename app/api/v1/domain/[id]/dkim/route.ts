/**
 * POST /api/v1/domain/[id]/dkim - Regenerate DKIM keys
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
 * POST /api/v1/domain/[id]/dkim
 * Regenerate DKIM keys for a domain
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
        const domain = await DomainService.regenerateDkim(result.user.id, id)

        const cleanKey = domain.dkimPublicKey
            ?.replace(/-----BEGIN PUBLIC KEY-----/g, "")
            .replace(/-----END PUBLIC KEY-----/g, "")
            .replace(/[\n\r\s]/g, "")

        return withApiHeaders(
            apiSuccess({
                id: domain.id,
                domain: domain.domain,
                dkim_selector: domain.dkimSelector,
                dkim_record: {
                    type: "TXT",
                    host: `${domain.dkimSelector}._domainkey.${domain.domain}`,
                    value: `v=DKIM1; k=rsa; p=${cleanKey}`,
                },
            }, requestId),
            requestId,
            createRateLimitHeaders(result.rateLimit)
        )
    } catch (error) {
        return apiErrorFromUnknown(error, requestId)
    }
}
