/**
 * GET /api/v1/alias - List all aliases
 * POST /api/v1/alias - Create new alias
 * POST /api/v1/alias?generate=true - Quick random alias generation (Bitwarden compatible)
 *
 * Bitwarden/Addy.io compatible API
 *
 * Authentication: API key only (Bearer ak_...)
 */

import { z } from "zod"

import { apiError, apiList, apiSuccessWithStatus, ErrorCodes, zodErrorToDetails } from "@/lib/api-response"
import { withPolicy } from "@/lib/route-policy"
import { AliasService } from "@/lib/services/alias"
import {
    aliasCreateMetadataError,
    hasAliasMetadataFields,
    toAddyFormat,
} from "./_utils"

export const dynamic = "force-dynamic"

const formatMap: Record<string, "RANDOM" | "CUSTOM"> = {
    random_characters: "RANDOM",
    random_words: "RANDOM",
    uuid: "RANDOM",
    custom: "CUSTOM",
}

const createAliasSchema = z.object({
    domain: z.string().max(253).optional().default("anon.li"),
    format: z.enum(["random_characters", "random_words", "uuid", "custom"]).optional().default("random_characters"),
    local_part: z.string().max(64).optional(),
    recipient_ids: z.array(z.string().max(50)).max(10).optional(),
    recipient_email: z.string().email().max(254).optional(),
}).strict()

const generateSchema = z.object({
    domain: z.string().max(253).optional().default("anon.li"),
    recipient_ids: z.array(z.string().max(50)).max(10).optional(),
    recipient_email: z.string().email().max(254).optional(),
}).strict()

export const GET = withPolicy(
    {
        auth: "api_key",
        apiQuota: "alias",
        rateLimit: "api",
    },
    async (ctx) => {
        if (!ctx.userId) {
            return apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, ctx.requestId, 401)
        }

        const aliases = await AliasService.getAliases(ctx.userId)
        const data = aliases.map((alias) => toAddyFormat({
            id: alias.id,
            email: alias.email,
            active: alias.active,
            encryptedLabel: alias.encryptedLabel,
            encryptedNote: alias.encryptedNote,
            createdAt: alias.createdAt,
            updatedAt: alias.updatedAt,
        }))

        return apiList(data, ctx.requestId, { total: data.length, limit: data.length, offset: 0 })
    },
)

export const POST = withPolicy(
    {
        auth: "api_key",
        apiQuota: "alias",
        requireCsrf: true,
        checkBan: "alias",
        rateLimit: "aliasCreate",
    },
    async (ctx) => {
        if (!ctx.userId) {
            return apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, ctx.requestId, 401)
        }

        const url = new URL(ctx.request.url)
        const isGenerate = url.searchParams.get("generate") === "true"

        let body: unknown = {}
        if (isGenerate) {
            body = await ctx.request.json().catch(() => ({}))
        } else {
            body = await ctx.request.json().catch(() => null)
        }

        if (hasAliasMetadataFields(body)) {
            return aliasCreateMetadataError(ctx.requestId)
        }

        if (isGenerate) {
            const validation = generateSchema.safeParse(body)
            if (!validation.success) {
                return apiError(
                    "Validation failed",
                    ErrorCodes.VALIDATION_ERROR,
                    ctx.requestId,
                    400,
                    zodErrorToDetails(validation.error),
                )
            }

            const alias = await AliasService.createAlias(ctx.userId, {
                domain: validation.data.domain,
                format: "RANDOM",
                recipientEmail: validation.data.recipient_email,
                recipientIds: validation.data.recipient_ids,
            })

            return apiSuccessWithStatus(toAddyFormat({
                id: alias.id,
                email: alias.email,
                active: alias.active,
                encryptedLabel: alias.encryptedLabel,
                encryptedNote: alias.encryptedNote,
                createdAt: alias.createdAt,
                updatedAt: alias.updatedAt,
            }), ctx.requestId, 201)
        }

        const validation = createAliasSchema.safeParse(body)
        if (!validation.success) {
            return apiError(
                "Validation failed",
                ErrorCodes.VALIDATION_ERROR,
                ctx.requestId,
                400,
                zodErrorToDetails(validation.error),
            )
        }

        const internalFormat = formatMap[validation.data.format] || "RANDOM"
        const alias = await AliasService.createAlias(ctx.userId, {
            localPart: internalFormat === "CUSTOM" ? validation.data.local_part : undefined,
            domain: validation.data.domain,
            format: internalFormat,
            recipientEmail: validation.data.recipient_email,
            recipientIds: validation.data.recipient_ids,
        })

        return apiSuccessWithStatus(toAddyFormat({
            id: alias.id,
            email: alias.email,
            active: alias.active,
            encryptedLabel: alias.encryptedLabel,
            encryptedNote: alias.encryptedNote,
            createdAt: alias.createdAt,
            updatedAt: alias.updatedAt,
        }), ctx.requestId, 201)
    },
)
