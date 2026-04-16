/**
 * GET /api/v1/api-key - List all API keys
 * POST /api/v1/api-key - Create a new API key
 *
 * Authentication: browser session with 2FA verified
 */

import { z } from "zod"

import {
    apiError,
    apiList,
    apiSuccessWithStatus,
    ErrorCodes,
    zodErrorToDetails,
} from "@/lib/api-response"
import { getApiKeysByUserId } from "@/lib/data/api-key"
import { withPolicy } from "@/lib/route-policy"
import { ApiKeyService } from "@/lib/services/api-key"

export const dynamic = "force-dynamic"

const createApiKeySchema = z.object({
    label: z.string().trim().min(1).max(100).optional(),
    expires_in_days: z.number().int().min(1).max(365).optional(),
})

export const GET = withPolicy(
    {
        auth: "session",
        rateLimit: "apiKey",
    },
    async (ctx) => {
        if (!ctx.userId) {
            return apiError("Session authentication required", ErrorCodes.UNAUTHORIZED, ctx.requestId, 401)
        }

        const apiKeys = await getApiKeysByUserId(ctx.userId)
        return apiList(apiKeys.map((key) => ({
            id: key.id,
            key_prefix: key.keyPrefix,
            label: key.label,
            created_at: key.createdAt.toISOString(),
            last_used_at: key.lastUsedAt?.toISOString() ?? null,
            expires_at: key.expiresAt?.toISOString() ?? null,
        })), ctx.requestId, {
            total: apiKeys.length,
            limit: apiKeys.length,
            offset: 0,
        })
    },
)

export const POST = withPolicy(
    {
        auth: "session",
        requireCsrf: true,
        rateLimit: "apiKey",
    },
    async (ctx) => {
        if (!ctx.userId) {
            return apiError("Session authentication required", ErrorCodes.UNAUTHORIZED, ctx.requestId, 401)
        }

        const body = await ctx.request.json().catch(() => ({}))
        const validation = createApiKeySchema.safeParse(body)
        if (!validation.success) {
            return apiError(
                "Validation failed",
                ErrorCodes.VALIDATION_ERROR,
                ctx.requestId,
                400,
                zodErrorToDetails(validation.error),
            )
        }

        const expiresAt = validation.data.expires_in_days
            ? new Date(Date.now() + validation.data.expires_in_days * 86_400_000)
            : undefined

        const apiKey = await ApiKeyService.createWithMetadata(
            ctx.userId,
            validation.data.label || "My API Key",
            expiresAt,
        )

        return apiSuccessWithStatus({
            id: apiKey.id,
            key: apiKey.key,
            key_prefix: apiKey.keyPrefix,
            label: apiKey.label,
            created_at: apiKey.createdAt.toISOString(),
            expires_at: apiKey.expiresAt?.toISOString() ?? null,
        }, ctx.requestId, 201)
    },
)
