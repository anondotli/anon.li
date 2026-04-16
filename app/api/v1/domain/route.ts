/**
 * GET /api/v1/domain - List all domains
 * POST /api/v1/domain - Add a new domain
 *
 * Authentication: API key only (Bearer ak_...)
 */

import { z } from "zod"

import {
    apiError,
    apiList,
    apiSuccessWithStatus,
    ErrorCodes,
    zodErrorToDetails,
} from "@/lib/api-response"
import { prisma } from "@/lib/prisma"
import { withPolicy } from "@/lib/route-policy"
import { DomainService } from "@/lib/services/domain"

export const dynamic = "force-dynamic"

const createDomainSchema = z.object({
    domain: z.string().min(1).regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Invalid domain format"),
})

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
    }
}

export const GET = withPolicy(
    {
        auth: "api_key",
        rateLimit: "api",
    },
    async (ctx) => {
        if (!ctx.userId) {
            return apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, ctx.requestId, 401)
        }

        const domains = await prisma.domain.findMany({
            where: { userId: ctx.userId },
            orderBy: { createdAt: "desc" },
        })

        const data = domains.map(toApiFormat)
        return apiList(data, ctx.requestId, { total: data.length, limit: data.length, offset: 0 })
    },
)

export const POST = withPolicy(
    {
        auth: "api_key",
        requireCsrf: true,
        rateLimit: "domainCreate",
    },
    async (ctx) => {
        if (!ctx.userId) {
            return apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, ctx.requestId, 401)
        }

        const body = await ctx.request.json().catch(() => null)
        const validation = createDomainSchema.safeParse(body)
        if (!validation.success) {
            return apiError(
                "Validation failed",
                ErrorCodes.VALIDATION_ERROR,
                ctx.requestId,
                400,
                zodErrorToDetails(validation.error),
            )
        }

        const domain = await DomainService.createDomain(ctx.userId, validation.data.domain.toLowerCase())
        return apiSuccessWithStatus(toApiFormat(domain), ctx.requestId, 201)
    },
)
