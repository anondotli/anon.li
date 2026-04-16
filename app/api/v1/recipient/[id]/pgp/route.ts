/**
 * PUT /api/v1/recipient/[id]/pgp - Set PGP public key
 * DELETE /api/v1/recipient/[id]/pgp - Remove PGP key
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

const setPgpSchema = z.object({
    public_key: z.string().min(1, "Public key is required"),
    name: z.string().max(100).optional(),
})

export const PUT = withPolicy<RouteParams>(
    {
        auth: "api_key",
        requireCsrf: true,
        rateLimit: "pgpOps",
    },
    async (ctx, routeContext) => {
        if (!ctx.userId) {
            return apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, ctx.requestId, 401)
        }

        const { id } = await routeContext!.params
        const body = await ctx.request.json().catch(() => null)
        const validation = setPgpSchema.safeParse(body)
        if (!validation.success) {
            return apiError(
                "Validation failed",
                ErrorCodes.VALIDATION_ERROR,
                ctx.requestId,
                400,
                zodErrorToDetails(validation.error),
            )
        }

        const recipient = await RecipientService.setPgpKey(
            ctx.userId,
            id,
            validation.data.public_key,
            validation.data.name,
        )

        return apiSuccess({
            id: recipient.id,
            pgp_fingerprint: recipient.pgpFingerprint,
            pgp_key_name: recipient.pgpKeyName,
        }, ctx.requestId)
    },
)

export const DELETE = withPolicy<RouteParams>(
    {
        auth: "api_key",
        requireCsrf: true,
        rateLimit: "pgpOps",
    },
    async (ctx, routeContext) => {
        if (!ctx.userId) {
            return apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, ctx.requestId, 401)
        }

        const { id } = await routeContext!.params
        await RecipientService.removePgpKey(ctx.userId, id)
        return apiSuccess({ removed: true }, ctx.requestId)
    },
)
