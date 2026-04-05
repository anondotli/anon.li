/**
 * GET /api/v1/alias - List all aliases
 * POST /api/v1/alias - Create new alias
 * POST /api/v1/alias?generate=true - Quick random alias generation (Bitwarden compatible)
 *
 * Bitwarden/Addy.io compatible API
 *
 * Authentication: API key only (Bearer ak_...)
 */

import { requireApiKey } from "@/lib/api-auth"
import { createRateLimitHeaders } from "@/lib/api-rate-limit"
import { AliasService } from "@/lib/services/alias"
import { toAddyFormat } from "./_utils"
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

const formatMap: Record<string, "RANDOM" | "CUSTOM"> = {
    "random_characters": "RANDOM",
    "random_words": "RANDOM",
    "uuid": "RANDOM",
    "custom": "CUSTOM",
}

const createAliasSchema = z.object({
    domain: z.string().max(253).optional().default("anon.li"),
    description: z.string().max(50).optional(),
    note: z.string().max(500).optional(),
    format: z.enum(["random_characters", "random_words", "uuid", "custom"]).optional().default("random_characters"),
    local_part: z.string().max(64).optional(),
    recipient_ids: z.array(z.string().max(50)).max(10).optional(),
    recipient_email: z.string().email().max(254).optional(),
})

/**
 * GET /api/v1/alias
 * List all aliases for the authenticated user
 */
export async function GET(req: Request) {
    const requestId = generateRequestId()
    const auth = await requireApiKey(req, requestId)
    if ("error" in auth) return auth.error
    const { result } = auth

    try {
        const aliases = await AliasService.getAliases(result.user.id)

        // Transform to Addy.io compatible format
        const data = aliases.map(alias => toAddyFormat({
            id: alias.id,
            email: alias.email,
            active: alias.active,
            label: alias.label,
            note: alias.note,
            createdAt: alias.createdAt,
            updatedAt: alias.updatedAt,
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

// Schema for ?generate=true quick generation
const generateSchema = z.object({
    domain: z.string().max(253).optional().default("anon.li"),
    description: z.string().max(50).optional(),
    recipient_ids: z.array(z.string().max(50)).max(10).optional(),
    recipient_email: z.string().email().max(254).optional(),
})

/**
 * POST /api/v1/alias
 * Create a new alias (Addy.io/Bitwarden compatible)
 *
 * POST /api/v1/alias?generate=true
 * Quick random alias generation (Bitwarden compatible, merged from /generate route)
 */
export async function POST(req: Request) {
    const requestId = generateRequestId()
    const auth = await requireApiKey(req, requestId)
    if ("error" in auth) return auth.error
    const { result } = auth

    // Check if this is a quick generate request
    const url = new URL(req.url)
    const isGenerate = url.searchParams.get("generate") === "true"

    try {
        if (isGenerate) {
            // Quick generate mode (merged from /generate route)
            let body = {}
            try {
                body = await req.json()
            } catch {
                // Empty body is fine - use defaults
            }

            const validation = generateSchema.safeParse(body)
            if (!validation.success) {
                return apiError(
                    "Validation failed",
                    ErrorCodes.VALIDATION_ERROR,
                    requestId,
                    400,
                    zodErrorToDetails(validation.error)
                )
            }

            const { domain, description, recipient_ids, recipient_email } = validation.data

            const alias = await AliasService.createAlias(result.user.id, {
                domain,
                format: "RANDOM",
                recipientEmail: recipient_email,
                recipientIds: recipient_ids,
                label: description,
            })

            const data = toAddyFormat({
                id: alias.id,
                email: alias.email,
                active: alias.active,
                label: alias.label,
                note: alias.note,
                createdAt: alias.createdAt,
                updatedAt: alias.updatedAt,
            })

            return withApiHeaders(
                apiSuccessWithStatus(data, requestId, 201),
                requestId,
                createRateLimitHeaders(result.rateLimit)
            )
        }

        // Standard create mode
        const body = await req.json()
        const validation = createAliasSchema.safeParse(body)

        if (!validation.success) {
            return apiError(
                "Validation failed",
                ErrorCodes.VALIDATION_ERROR,
                requestId,
                400,
                zodErrorToDetails(validation.error)
            )
        }

        const { domain, format, local_part, recipient_ids, recipient_email, note, description } = validation.data

        // Map Addy.io format to our internal format
        const internalFormat = formatMap[format] || "RANDOM"

        const alias = await AliasService.createAlias(result.user.id, {
            localPart: internalFormat === "CUSTOM" ? local_part : undefined,
            domain,
            format: internalFormat,
            recipientEmail: recipient_email,
            recipientIds: recipient_ids,
            label: description,
            note,
        })

        // Transform to Addy.io compatible format
        const data = toAddyFormat({
            id: alias.id,
            email: alias.email,
            active: alias.active,
            label: alias.label,
            note: alias.note,
            createdAt: alias.createdAt,
            updatedAt: alias.updatedAt,
        })

        return withApiHeaders(
            apiSuccessWithStatus(data, requestId, 201),
            requestId,
            createRateLimitHeaders(result.rateLimit)
        )
    } catch (error: unknown) {
        return apiErrorFromUnknown(error, requestId)
    }
}
