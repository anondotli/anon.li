/**
 * POST /api/v1/domain/[id]/verify - Verify domain DNS records
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
        const verification = await DomainService.verifyDomain(ctx.userId, id)

        return apiSuccess({
            verified: verification.verified,
            ownership_verified: verification.ownershipVerified,
            mx_verified: verification.mxVerified,
            spf_verified: verification.spfVerified,
            dkim_verified: verification.dkimVerified,
            dns_verified: verification.dnsVerified,
        }, ctx.requestId)
    },
)
