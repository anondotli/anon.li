/**
 * GET /api/v1/alias/:id - Get single alias
 * PATCH /api/v1/alias/:id - Update alias
 * DELETE /api/v1/alias/:id - Delete alias
 *
 * Bitwarden/Addy.io compatible API
 *
 * Authentication: API key only (Bearer ak_...)
 */

import { z } from "zod"

import { getAliasById } from "@/lib/data/alias"
import { apiError, apiSuccess, ErrorCodes, zodErrorToDetails } from "@/lib/api-response"
import { withPolicy } from "@/lib/route-policy"
import { AliasService } from "@/lib/services/alias"
import { encryptedAliasMetadataSchema } from "@/lib/validations/alias"
import {
    aliasPlaintextMetadataError,
    hasAliasMetadataFields,
    hasPlaintextAliasMetadataFields,
    resolveAlias,
    toAddyFormat,
} from "../_utils"

export const dynamic = "force-dynamic"

interface RouteParams {
    params: Promise<{ id: string }>
}

const updateAliasSchema = z.object({
    active: z.boolean().optional(),
    description: z.string().optional(),
    label: z.string().max(50).optional().nullable(),
    note: z.string().max(500).optional().nullable(),
    encrypted_label: encryptedAliasMetadataSchema.optional().nullable(),
    encrypted_note: encryptedAliasMetadataSchema.optional().nullable(),
    recipient_id: z.string().max(50).optional(),
    recipient_ids: z.array(z.string().max(50)).max(10).optional(),
    recipient_email: z.string().email().max(254).optional(),
}).strict()

export const GET = withPolicy<RouteParams>(
    {
        auth: "api_key",
        apiQuota: "alias",
        rateLimit: "api",
    },
    async (ctx, routeContext) => {
        if (!ctx.userId) {
            return apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, ctx.requestId, 401)
        }

        const { id } = await routeContext!.params
        const alias = await resolveAlias(id, ctx.userId)

        if (!alias) {
            return apiError("Alias not found", ErrorCodes.NOT_FOUND, ctx.requestId, 404)
        }

        return apiSuccess(toAddyFormat({
            id: alias.id,
            email: alias.email,
            active: alias.active,
            encryptedLabel: alias.encryptedLabel,
            encryptedNote: alias.encryptedNote,
            createdAt: alias.createdAt,
            updatedAt: alias.updatedAt,
        }), ctx.requestId)
    },
)

export const PATCH = withPolicy<RouteParams>(
    {
        auth: "api_key",
        apiQuota: "alias",
        requireCsrf: true,
        rateLimit: "api",
    },
    async (ctx, routeContext) => {
        if (!ctx.userId) {
            return apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, ctx.requestId, 401)
        }

        const { id } = await routeContext!.params
        const body = await ctx.request.json().catch(() => null)
        const validation = updateAliasSchema.safeParse(body)

        if (!validation.success) {
            return apiError(
                "Validation failed",
                ErrorCodes.VALIDATION_ERROR,
                ctx.requestId,
                400,
                zodErrorToDetails(validation.error),
            )
        }

        if (hasAliasMetadataFields(body) && hasPlaintextAliasMetadataFields(body)) {
            return aliasPlaintextMetadataError(ctx.requestId)
        }

        const existing = await resolveAlias(id, ctx.userId)
        if (!existing) {
            return apiError("Alias not found", ErrorCodes.NOT_FOUND, ctx.requestId, 404)
        }

        const aliasId = existing.id
        const {
            active,
            encrypted_label,
            encrypted_note,
            recipient_id,
            recipient_ids,
            recipient_email,
        } = validation.data

        if (active !== undefined && active !== existing.active) {
            await AliasService.toggleAlias(ctx.userId, aliasId)
        }

        const updateData: {
            encryptedLabel?: string | null
            encryptedNote?: string | null
            clearLegacyLabel?: boolean
            clearLegacyNote?: boolean
            recipientId?: string
            recipientEmail?: string
            recipientIds?: string[]
        } = {}

        if (encrypted_label !== undefined) {
            updateData.encryptedLabel = encrypted_label
            updateData.clearLegacyLabel = true
        }
        if (encrypted_note !== undefined) {
            updateData.encryptedNote = encrypted_note
            updateData.clearLegacyNote = true
        }
        if (recipient_ids !== undefined) {
            updateData.recipientIds = recipient_ids
        } else if (recipient_id !== undefined) {
            updateData.recipientId = recipient_id
        }
        if (recipient_email !== undefined) {
            updateData.recipientEmail = recipient_email
        }
        if (Object.keys(updateData).length > 0) {
            await AliasService.updateAlias(ctx.userId, aliasId, updateData)
        }

        const alias = await getAliasById(aliasId, ctx.userId)
        if (!alias) {
            return apiError("Alias not found", ErrorCodes.NOT_FOUND, ctx.requestId, 404)
        }

        return apiSuccess(toAddyFormat({
            id: alias.id,
            email: alias.email,
            active: alias.active,
            encryptedLabel: alias.encryptedLabel,
            encryptedNote: alias.encryptedNote,
            createdAt: alias.createdAt,
            updatedAt: alias.updatedAt,
        }), ctx.requestId)
    },
)

export const DELETE = withPolicy<RouteParams>(
    {
        auth: "api_key",
        apiQuota: "alias",
        requireCsrf: true,
        rateLimit: "api",
    },
    async (ctx, routeContext) => {
        if (!ctx.userId) {
            return apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, ctx.requestId, 401)
        }

        const { id } = await routeContext!.params
        const alias = await resolveAlias(id, ctx.userId)
        if (!alias) {
            return apiError("Alias not found", ErrorCodes.NOT_FOUND, ctx.requestId, 404)
        }

        await AliasService.deleteAlias(ctx.userId, alias.id)
        return apiSuccess({ deleted: true }, ctx.requestId)
    },
)
