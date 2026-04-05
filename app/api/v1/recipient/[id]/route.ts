/**
 * GET /api/v1/recipient/[id] - Get recipient details
 * PATCH /api/v1/recipient/[id] - Update recipient (set as default)
 * DELETE /api/v1/recipient/[id] - Delete recipient
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

const updateRecipientSchema = z.object({
    is_default: z.boolean().optional(),
})

function toApiFormat(recipient: {
    id: string
    email: string
    verified: boolean
    isDefault: boolean
    pgpFingerprint: string | null
    pgpKeyName: string | null
    createdAt: Date
    _count?: { aliases: number }
}) {
    return {
        id: recipient.id,
        email: recipient.email,
        verified: recipient.verified,
        is_default: recipient.isDefault,
        pgp_fingerprint: recipient.pgpFingerprint,
        pgp_key_name: recipient.pgpKeyName,
        alias_count: recipient._count?.aliases ?? 0,
        created_at: recipient.createdAt.toISOString(),
    }
}

/**
 * GET /api/v1/recipient/[id]
 * Get recipient details
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
        const recipient = await RecipientService.getRecipient(result.user.id, id)
        return withApiHeaders(
            apiSuccess(toApiFormat(recipient), requestId),
            requestId,
            createRateLimitHeaders(result.rateLimit)
        )
    } catch (error) {
        return apiErrorFromUnknown(error, requestId)
    }
}

/**
 * PATCH /api/v1/recipient/[id]
 * Update recipient (currently only supports setting as default)
 */
export async function PATCH(req: Request, { params }: RouteParams) {
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
        const validation = updateRecipientSchema.safeParse(body)

        if (!validation.success) {
            return apiError(
                "Validation failed",
                ErrorCodes.VALIDATION_ERROR,
                requestId,
                400,
                zodErrorToDetails(validation.error)
            )
        }

        let recipient
        if (validation.data.is_default) {
            recipient = await RecipientService.setAsDefault(result.user.id, id)
        } else {
            recipient = await RecipientService.getRecipient(result.user.id, id)
        }

        return withApiHeaders(
            apiSuccess(toApiFormat(recipient), requestId),
            requestId,
            createRateLimitHeaders(result.rateLimit)
        )
    } catch (error) {
        return apiErrorFromUnknown(error, requestId)
    }
}

/**
 * DELETE /api/v1/recipient/[id]
 * Delete a recipient
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
        await RecipientService.deleteRecipient(result.user.id, id)
        return withApiHeaders(
            apiSuccess({ deleted: true }, requestId),
            requestId,
            createRateLimitHeaders(result.rateLimit)
        )
    } catch (error) {
        return apiErrorFromUnknown(error, requestId)
    }
}
