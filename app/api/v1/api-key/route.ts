/**
 * GET /api/v1/api-key - List all API keys
 * POST /api/v1/api-key - Create a new API key
 *
 * Authentication: API key only (Bearer ak_...)
 */

import { requireApiKey } from "@/lib/api-auth"
import { createRateLimitHeaders } from "@/lib/api-rate-limit"
import { getApiKeysByUserId } from "@/lib/data/api-key"
import { ApiKeyService } from "@/lib/services/api-key"
import { z } from "zod"
import {
    generateRequestId,
    apiSuccessWithStatus,
    apiList,
    apiError,
    apiErrorFromUnknown,
    withApiHeaders,
    ErrorCodes,
    zodErrorToDetails,
} from "@/lib/api-response"

export const dynamic = 'force-dynamic'

const createApiKeySchema = z.object({
    label: z.string().max(100).optional(),
    expires_in_days: z.number().int().min(1).max(365).optional(),
})

/**
 * GET /api/v1/api-key
 * List all API keys for the authenticated user (keys are masked)
 */
export async function GET(req: Request) {
    const requestId = generateRequestId()
    const auth = await requireApiKey(req, requestId)
    if ("error" in auth) return auth.error
    const { result } = auth

    try {
        const apiKeys = await getApiKeysByUserId(result.user.id)

        const data = apiKeys.map(key => ({
            id: key.id,
            key_prefix: key.keyPrefix,
            label: key.label,
            created_at: key.createdAt.toISOString(),
            last_used_at: key.lastUsedAt?.toISOString() ?? null,
            expires_at: key.expiresAt?.toISOString() ?? null,
        }))

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
 * POST /api/v1/api-key
 * Create a new API key
 */
export async function POST(req: Request) {
    const requestId = generateRequestId()
    const auth = await requireApiKey(req, requestId)
    if ("error" in auth) return auth.error
    const { result } = auth

    try {
        let body = {}
        try {
            body = await req.json()
        } catch {
            // Empty body is fine
        }

        const validation = createApiKeySchema.safeParse(body)
        if (!validation.success) {
            return apiError(
                "Validation failed",
                ErrorCodes.VALIDATION_ERROR,
                requestId,
                400,
                zodErrorToDetails(validation.error)
            )
        }

        const expiresAt = validation.data.expires_in_days
            ? new Date(Date.now() + validation.data.expires_in_days * 86_400_000)
            : undefined

        const apiKey = await ApiKeyService.createWithMetadata(
            result.user.id,
            validation.data.label || "My API Key",
            expiresAt,
        )

        // Return the full key ONLY on creation
        return withApiHeaders(
            apiSuccessWithStatus({
                id: apiKey.id,
                key: apiKey.key, // Only shown once!
                key_prefix: apiKey.keyPrefix,
                label: apiKey.label,
                created_at: apiKey.createdAt.toISOString(),
                expires_at: apiKey.expiresAt?.toISOString() ?? null,
            }, requestId, 201),
            requestId,
            createRateLimitHeaders(result.rateLimit)
        )
    } catch (error) {
        return apiErrorFromUnknown(error, requestId)
    }
}
