/**
 * GET /api/v1/domain/[id] - Get domain details
 * DELETE /api/v1/domain/[id] - Delete domain
 *
 * Authentication: API key only (Bearer ak_...)
 */

import { apiError, apiSuccess, ErrorCodes } from "@/lib/api-response"
import { prisma } from "@/lib/prisma"
import { withPolicy } from "@/lib/route-policy"
import { DomainService } from "@/lib/services/domain"

export const dynamic = "force-dynamic"

interface RouteParams {
    params: Promise<{ id: string }>
}

function toApiFormat(domain: {
    id: string
    domain: string
    verified: boolean
    ownershipVerified: boolean
    mxVerified: boolean
    spfVerified: boolean
    dkimVerified: boolean
    verificationToken: string
    dkimPublicKey: string | null
    dkimSelector: string | null
    createdAt: Date
}) {
    return {
        id: domain.id,
        domain: domain.domain,
        verified: domain.verified,
        ownership_verified: domain.ownershipVerified,
        mx_verified: domain.mxVerified,
        spf_verified: domain.spfVerified,
        dkim_verified: domain.dkimVerified,
        verification_token: domain.verificationToken,
        dkim_public_key: domain.dkimPublicKey,
        dkim_selector: domain.dkimSelector,
        created_at: domain.createdAt.toISOString(),
        dns_records: {
            ownership: {
                type: "TXT",
                host: domain.domain,
                value: `anon.li=${domain.verificationToken}`,
            },
            mx: {
                type: "MX",
                host: domain.domain,
                value: "mx.anon.li",
                priority: 10,
            },
            spf: {
                type: "TXT",
                host: domain.domain,
                value: "v=spf1 include:anon.li ~all",
            },
            dkim: domain.dkimPublicKey && domain.dkimSelector
                ? {
                    type: "TXT",
                    host: `${domain.dkimSelector}._domainkey.${domain.domain}`,
                    value: `v=DKIM1; k=rsa; p=${domain.dkimPublicKey.replace(/-----BEGIN PUBLIC KEY-----/g, "").replace(/-----END PUBLIC KEY-----/g, "").replace(/[\n\r\s]/g, "")}`,
                }
                : null,
        },
    }
}

export const GET = withPolicy<RouteParams>(
    {
        auth: "api_key",
        rateLimit: "api",
    },
    async (ctx, routeContext) => {
        if (!ctx.userId) {
            return apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, ctx.requestId, 401)
        }

        const { id } = await routeContext!.params
        const domain = await prisma.domain.findUnique({ where: { id } })
        if (!domain || domain.userId !== ctx.userId) {
            return apiError("Domain not found", ErrorCodes.NOT_FOUND, ctx.requestId, 404)
        }

        return apiSuccess(toApiFormat(domain), ctx.requestId)
    },
)

export const DELETE = withPolicy<RouteParams>(
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
        await DomainService.deleteDomain(ctx.userId, id)
        return apiSuccess({ deleted: true }, ctx.requestId)
    },
)
