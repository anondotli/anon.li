/**
 * GET /api/v1/domain/[id] - Get domain details
 * DELETE /api/v1/domain/[id] - Delete domain
 *
 * Authentication: API key only (Bearer ak_...)
 */

import { validateApiKey } from "@/lib/api-auth"
import { createRateLimitHeaders } from "@/lib/api-rate-limit"
import { DomainService } from "@/lib/services/domain"
import { prisma } from "@/lib/prisma"
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
        // DNS records to configure
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
            dkim: domain.dkimPublicKey && domain.dkimSelector ? {
                type: "TXT",
                host: `${domain.dkimSelector}._domainkey.${domain.domain}`,
                value: `v=DKIM1; k=rsa; p=${domain.dkimPublicKey.replace(/-----BEGIN PUBLIC KEY-----/g, "").replace(/-----END PUBLIC KEY-----/g, "").replace(/[\n\r\s]/g, "")}`,
            } : null,
        },
    }
}

/**
 * GET /api/v1/domain/[id]
 * Get domain details with DNS records
 */
export async function GET(req: Request, { params }: RouteParams) {
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
        const domain = await prisma.domain.findUnique({
            where: { id },
        })

        if (!domain || domain.userId !== result.user.id) {
            return apiError("Domain not found", ErrorCodes.NOT_FOUND, requestId, 404)
        }

        return withApiHeaders(
            apiSuccess(toApiFormat(domain), requestId),
            requestId,
            createRateLimitHeaders(result.rateLimit)
        )
    } catch (error) {
        return apiErrorFromUnknown(error, requestId)
    }
}

/**
 * DELETE /api/v1/domain/[id]
 * Delete a domain
 */
export async function DELETE(req: Request, { params }: RouteParams) {
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
        await DomainService.deleteDomain(result.user.id, id)
        return withApiHeaders(
            apiSuccess({ deleted: true }, requestId),
            requestId,
            createRateLimitHeaders(result.rateLimit)
        )
    } catch (error) {
        return apiErrorFromUnknown(error, requestId)
    }
}
