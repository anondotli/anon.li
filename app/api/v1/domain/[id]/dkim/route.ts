/**
 * POST /api/v1/domain/[id]/dkim - Regenerate DKIM keys
 *
 * Authentication: API key only (Bearer ak_...)
 */

import { apiError, apiSuccess, ErrorCodes } from "@/lib/api-response"
import { withPolicy } from "@/lib/route-policy"
import { DomainService } from "@/lib/services/domain"

export const dynamic = "force-dynamic"

interface RouteParams {
    params: Promise<{ id: string }>
}

export const POST = withPolicy<RouteParams>(
    {
        auth: "api_key",
        requireCsrf: true,
        rateLimit: "domainOps",
    },
    async (ctx, routeContext) => {
        if (!ctx.userId) {
            return apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, ctx.requestId, 401)
        }

        const { id } = await routeContext!.params
        const domain = await DomainService.regenerateDkim(ctx.userId, id)
        const cleanKey = domain.dkimPublicKey
            ?.replace(/-----BEGIN PUBLIC KEY-----/g, "")
            .replace(/-----END PUBLIC KEY-----/g, "")
            .replace(/[\n\r\s]/g, "")

        return apiSuccess({
            id: domain.id,
            domain: domain.domain,
            dkim_selector: domain.dkimSelector,
            dkim_record: {
                type: "TXT",
                host: `${domain.dkimSelector}._domainkey.${domain.domain}`,
                value: `v=DKIM1; k=rsa; p=${cleanKey}`,
            },
        }, ctx.requestId)
    },
)
