/**
 * GET /api/v1/recipient - List all recipients
 * POST /api/v1/recipient - Add a new recipient
 *
 * Authentication: API key only (Bearer ak_...)
 */

import { requireApiKey } from "@/lib/api-auth"
import { createRateLimitHeaders } from "@/lib/api-rate-limit"
import { RecipientService } from "@/lib/services/recipient"
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

/**
 * GET /api/v1/recipient
 * List all recipients for the authenticated user
 */
export async function GET(req: Request) {
    const requestId = generateRequestId()
    const auth = await requireApiKey(req, requestId)
    if ("error" in auth) return auth.error
    const { result } = auth

    try {
        const recipients = await RecipientService.getRecipients(result.user.id)
        const data = recipients.map(toApiFormat)

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
 * POST /api/v1/recipient
 * Add a new recipient
 */
export async function POST(req: Request) {
    const requestId = generateRequestId()
    const auth = await requireApiKey(req, requestId)
    if ("error" in auth) return auth.error
    const { result } = auth

    try {
        const body = await req.json()
        const validation = createRecipientSchema.safeParse(body)

        if (!validation.success) {
            return apiError(
                "Validation failed",
                ErrorCodes.VALIDATION_ERROR,
                requestId,
                400,
                zodErrorToDetails(validation.error)
            )
        }

        const recipient = await RecipientService.addRecipient(
            result.user.id,
            validation.data.email
        )

        const data = {
            id: recipient.id,
            email: recipient.email,
            verified: recipient.verified,
            is_default: recipient.isDefault,
            created_at: recipient.createdAt.toISOString(),
        }

        return withApiHeaders(
            apiSuccessWithStatus(data, requestId, 201),
            requestId,
            createRateLimitHeaders(result.rateLimit)
        )
    } catch (error) {
        return apiErrorFromUnknown(error, requestId)
    }
}
