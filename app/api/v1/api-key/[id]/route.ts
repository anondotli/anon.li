/**
 * DELETE /api/v1/api-key/[id] - Delete an API key
 *
 * Authentication: API key only (Bearer ak_...)
 */

import { requireApiKey } from "@/lib/api-auth"
import { createRateLimitHeaders } from "@/lib/api-rate-limit"
import { getApiKeyById } from "@/lib/data/api-key"
import { ApiKeyService } from "@/lib/services/api-key"
import {
    generateRequestId,
    apiSuccess,
    apiError,
    withApiHeaders,
    ErrorCodes,
} from "@/lib/api-response"

export const dynamic = 'force-dynamic'

interface RouteParams {
    params: Promise<{ id: string }>
}

/**
 * DELETE /api/v1/api-key/[id]
 * Delete an API key (cannot delete the key currently in use)
 */
export async function DELETE(req: Request, { params }: RouteParams) {
    const requestId = generateRequestId()
    const { id } = await params
    const auth = await requireApiKey(req, requestId)
    if ("error" in auth) return auth.error
    const { result } = auth

    try {
        // Find the key to delete
        const keyToDelete = await getApiKeyById(id)

        if (!keyToDelete || keyToDelete.userId !== result.user.id) {
            return apiError("API key not found", ErrorCodes.NOT_FOUND, requestId, 404)
        }

        // Check if trying to delete the current key
        if (keyToDelete.id === result.apiKeyId) {
            return apiError(
                "Cannot delete the API key currently in use",
                ErrorCodes.FORBIDDEN,
                requestId,
                403
            )
        }

        await ApiKeyService.delete(result.user.id, id)

        return withApiHeaders(
            apiSuccess({ deleted: true }, requestId),
            requestId,
            createRateLimitHeaders(result.rateLimit)
        )
    } catch (error) {
        return apiError(
            error instanceof Error ? error.message : "Failed to delete API key",
            ErrorCodes.INTERNAL_ERROR,
            requestId,
            500
        )
    }
}
