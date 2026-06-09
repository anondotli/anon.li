/**
 * DELETE /api/v1/api-key/[id] - Delete an API key
 *
 * Authentication: browser session with 2FA verified
 */

import { apiError, apiSuccess, ErrorCodes } from "@/lib/api-response"
import { withPolicy, scopeFromContext } from "@/lib/route-policy"
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
        // ApiKeyService.delete performs the cross-tenant ownership check and
        // throws NotFoundError (→ 404) when the key is outside the caller's scope.
        await ApiKeyService.delete(scopeFromContext(ctx), id)
        return apiSuccess({ deleted: true }, ctx.requestId)
    },
)
