/**
 * GET /api/v1/recipient/[id] - Get recipient details
 * PATCH /api/v1/recipient/[id] - Update recipient (set as default)
 * DELETE /api/v1/recipient/[id] - Delete recipient
 *
 * Authentication: API key only (Bearer ak_...)
 */

import { z } from "zod"

import { apiError, apiSuccess, ErrorCodes, zodErrorToDetails } from "@/lib/api-response"
import { withPolicy } from "@/lib/route-policy"
import { RecipientService } from "@/lib/services/recipient"

export const dynamic = "force-dynamic"

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

export const GET = withPolicy<RouteParams>(
    {
        auth: "api_key",
        rateLimit: "api",
    },
    async (ctx, routeContext) => {
        if (!ctx.userId) {
            return apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, ctx.requestId, 401)
        }

        const { id } = await routeContext!.params
        const recipient = await RecipientService.getRecipient(ctx.userId, id)
        return apiSuccess(toApiFormat(recipient), ctx.requestId)
    },
)

export const PATCH = withPolicy<RouteParams>(
    {
        auth: "api_key",
        requireCsrf: true,
        rateLimit: "recipientOps",
    },
    async (ctx, routeContext) => {
        if (!ctx.userId) {
            return apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, ctx.requestId, 401)
        }

        const { id } = await routeContext!.params
        const body = await ctx.request.json().catch(() => null)
        const validation = updateRecipientSchema.safeParse(body)
        if (!validation.success) {
            return apiError(
                "Validation failed",
                ErrorCodes.VALIDATION_ERROR,
                ctx.requestId,
                400,
                zodErrorToDetails(validation.error),
            )
        }

        const recipient = validation.data.is_default
            ? await RecipientService.setAsDefault(ctx.userId, id)
            : await RecipientService.getRecipient(ctx.userId, id)

        return apiSuccess(toApiFormat(recipient), ctx.requestId)
    },
)

export const DELETE = withPolicy<RouteParams>(
    {
        auth: "api_key",
        requireCsrf: true,
        rateLimit: "recipientOps",
    },
    async (ctx, routeContext) => {
        if (!ctx.userId) {
            return apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, ctx.requestId, 401)
        }

        const { id } = await routeContext!.params
        await RecipientService.deleteRecipient(ctx.userId, id)
        return apiSuccess({ deleted: true }, ctx.requestId)
    },
)
