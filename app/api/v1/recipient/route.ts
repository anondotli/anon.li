/**
 * GET /api/v1/recipient - List all recipients
 * POST /api/v1/recipient - Add a new recipient
 *
 * Authentication: API key only (Bearer ak_...)
 */

import { z } from "zod"

import {
    apiError,
    apiList,
    apiSuccessWithStatus,
    ErrorCodes,
    zodErrorToDetails,
} from "@/lib/api-response"
import { withPolicy } from "@/lib/route-policy"
import { RecipientService } from "@/lib/services/recipient"

export const dynamic = "force-dynamic"

const createRecipientSchema = z.object({
    email: z.string().email("Invalid email address"),
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

export const GET = withPolicy(
    {
        auth: "api_key",
        rateLimit: "api",
    },
    async (ctx) => {
        if (!ctx.userId) {
            return apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, ctx.requestId, 401)
        }

        const recipients = await RecipientService.getRecipients(ctx.userId)
        const data = recipients.map(toApiFormat)
        return apiList(data, ctx.requestId, { total: data.length, limit: data.length, offset: 0 })
    },
)

export const POST = withPolicy(
    {
        auth: "api_key",
        requireCsrf: true,
        rateLimit: "recipientOps",
    },
    async (ctx) => {
        if (!ctx.userId) {
            return apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, ctx.requestId, 401)
        }

        const body = await ctx.request.json().catch(() => null)
        const validation = createRecipientSchema.safeParse(body)

        if (!validation.success) {
            return apiError(
                "Validation failed",
                ErrorCodes.VALIDATION_ERROR,
                ctx.requestId,
                400,
                zodErrorToDetails(validation.error),
            )
        }

        const recipient = await RecipientService.addRecipient(ctx.userId, validation.data.email)
        return apiSuccessWithStatus({
            id: recipient.id,
            email: recipient.email,
            verified: recipient.verified,
            is_default: recipient.isDefault,
            created_at: recipient.createdAt.toISOString(),
        }, ctx.requestId, 201)
    },
)
