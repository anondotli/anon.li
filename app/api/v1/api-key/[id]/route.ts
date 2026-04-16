/**
 * DELETE /api/v1/api-key/[id] - Delete an API key
 *
 * Authentication: browser session with 2FA verified
 */

import { apiError, apiSuccess, ErrorCodes } from "@/lib/api-response"
import { getApiKeyById } from "@/lib/data/api-key"
import { withPolicy } from "@/lib/route-policy"
import { ApiKeyService } from "@/lib/services/api-key"

export const dynamic = "force-dynamic"

interface RouteParams {
    params: Promise<{ id: string }>
}

export const DELETE = withPolicy<RouteParams>(
    {
        auth: "session",
        requireCsrf: true,
        rateLimit: "apiKey",
    },
    async (ctx, routeContext) => {
        if (!ctx.userId) {
            return apiError("Session authentication required", ErrorCodes.UNAUTHORIZED, ctx.requestId, 401)
        }

        const { id } = await routeContext!.params
        const keyToDelete = await getApiKeyById(id)
        if (!keyToDelete || keyToDelete.userId !== ctx.userId) {
            return apiError("API key not found", ErrorCodes.NOT_FOUND, ctx.requestId, 404)
        }

        await ApiKeyService.delete(ctx.userId, id)
        return apiSuccess({ deleted: true }, ctx.requestId)
    },
)
