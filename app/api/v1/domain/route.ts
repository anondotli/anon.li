/**
 * GET /api/v1/domain - List all domains
 * POST /api/v1/domain - Add a new domain
 *
 * Authentication: API key only (Bearer ak_...)
 */

import { validateApiKey } from "@/lib/api-auth"
import { createRateLimitHeaders } from "@/lib/api-rate-limit"
import { DomainService } from "@/lib/services/domain"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import {
    generateRequestId,
    apiSuccessWithStatus,
    apiList,
    apiError,
    apiErrorFromUnknown,
    apiRateLimitError,
    withApiHeaders,
    ErrorCodes,
    zodErrorToDetails,
} from "@/lib/api-response"

export const dynamic = 'force-dynamic'

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

/**
 * GET /api/v1/domain
 * List all domains for the authenticated user
 */
export async function GET(req: Request) {
    const requestId = generateRequestId()
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
        const domains = await prisma.domain.findMany({
            where: { userId: result.user.id },
            orderBy: { createdAt: "desc" },
        })

        const data = domains.map(toApiFormat)

        return withApiHeaders(
            apiList(data, requestId, { total: data.length, limit: data.length, offset: 0 }),
            requestId,
            createRateLimitHeaders(result.rateLimit)
        )
    } catch (error) {
        return apiErrorFromUnknown(error, requestId)
    }
}

/**
 * POST /api/v1/domain
 * Add a new domain
 */
export async function POST(req: Request) {
    const requestId = generateRequestId()
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
        const body = await req.json()
        const validation = createDomainSchema.safeParse(body)

        if (!validation.success) {
            return apiError(
                "Validation failed",
                ErrorCodes.VALIDATION_ERROR,
                requestId,
                400,
                zodErrorToDetails(validation.error)
            )
        }

        const domain = await DomainService.createDomain(
            result.user.id,
            validation.data.domain.toLowerCase()
        )

        return withApiHeaders(
            apiSuccessWithStatus(toApiFormat(domain), requestId, 201),
            requestId,
            createRateLimitHeaders(result.rateLimit)
        )
    } catch (error) {
        return apiErrorFromUnknown(error, requestId)
    }
}
