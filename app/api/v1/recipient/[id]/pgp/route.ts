/**
 * PUT /api/v1/recipient/[id]/pgp - Set PGP public key
 * DELETE /api/v1/recipient/[id]/pgp - Remove PGP key
 *
 * Authentication: API key only (Bearer ak_...)
 */

import { validateApiKey } from "@/lib/api-auth"
import { createRateLimitHeaders } from "@/lib/api-rate-limit"
import { RecipientService } from "@/lib/services/recipient"
import { z } from "zod"
import {
    generateRequestId,
    apiSuccess,
    apiError,
    apiErrorFromUnknown,
    apiRateLimitError,
    withApiHeaders,
    ErrorCodes,
    zodErrorToDetails,
} from "@/lib/api-response"

export const dynamic = 'force-dynamic'

interface RouteParams {
    params: Promise<{ id: string }>
}

const setPgpSchema = z.object({
    public_key: z.string().min(1, "Public key is required"),
    name: z.string().max(100).optional(),
})

/**
 * PUT /api/v1/recipient/[id]/pgp
 * Set PGP public key for a recipient
 */
export async function PUT(req: Request, { params }: RouteParams) {
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
        const body = await req.json()
        const validation = setPgpSchema.safeParse(body)

        if (!validation.success) {
            return apiError(
                "Validation failed",
                ErrorCodes.VALIDATION_ERROR,
                requestId,
                400,
                zodErrorToDetails(validation.error)
            )
        }

        const recipient = await RecipientService.setPgpKey(
            result.user.id,
            id,
            validation.data.public_key,
            validation.data.name
        )

        return withApiHeaders(
            apiSuccess({
                id: recipient.id,
                pgp_fingerprint: recipient.pgpFingerprint,
                pgp_key_name: recipient.pgpKeyName,
            }, requestId),
            requestId,
            createRateLimitHeaders(result.rateLimit)
        )
    } catch (error) {
        return apiErrorFromUnknown(error, requestId)
    }
}

/**
 * DELETE /api/v1/recipient/[id]/pgp
 * Remove PGP key from a recipient
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
        await RecipientService.removePgpKey(result.user.id, id)
        return withApiHeaders(
            apiSuccess({ removed: true }, requestId),
            requestId,
            createRateLimitHeaders(result.rateLimit)
        )
    } catch (error) {
        return apiErrorFromUnknown(error, requestId)
    }
}
