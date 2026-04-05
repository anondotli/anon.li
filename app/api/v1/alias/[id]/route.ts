/**
 * GET /api/v1/alias/:id - Get single alias
 * PATCH /api/v1/alias/:id - Update alias
 * DELETE /api/v1/alias/:id - Delete alias
 *
 * Bitwarden/Addy.io compatible API
 *
 * Authentication: API key only (Bearer ak_...)
 */

import { requireApiKey } from "@/lib/api-auth"
import { createRateLimitHeaders } from "@/lib/api-rate-limit"
import { AliasService } from "@/lib/services/alias"
import { getAliasById } from "@/lib/data/alias"
import { toAddyFormat, resolveAlias } from "../_utils"
import { z } from "zod"
import {
    generateRequestId,
    apiSuccess,
    apiError,
    apiErrorFromUnknown,
    withApiHeaders,
    ErrorCodes,
    zodErrorToDetails,
} from "@/lib/api-response"

export const dynamic = 'force-dynamic'

interface RouteParams {
    params: Promise<{ id: string }>
}

const updateAliasSchema = z.object({
    active: z.boolean().optional(),
    description: z.string().optional(),
    label: z.string().max(50).optional().nullable(),
    note: z.string().max(500).optional().nullable(),
    recipient_id: z.string().max(50).optional(),
    recipient_ids: z.array(z.string().max(50)).max(10).optional(),
    recipient_email: z.string().email().max(254).optional(),
})

/**
 * GET /api/v1/alias/:id
 * Get a single alias by ID
 */
export async function GET(req: Request, { params }: RouteParams) {
    const { id } = await params
    const requestId = generateRequestId()
    const auth = await requireApiKey(req, requestId)
    if ("error" in auth) return auth.error
    const { result } = auth

    try {
        const alias = await resolveAlias(id, result.user.id)

        if (!alias) {
            return apiError("Alias not found", ErrorCodes.NOT_FOUND, requestId, 404)
        }

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
            apiSuccess(data, requestId),
            requestId,
            createRateLimitHeaders(result.rateLimit)
        )
    } catch (error) {
        return apiErrorFromUnknown(error, requestId)
    }
}

/**
 * PATCH /api/v1/alias/:id
 * Update an alias (toggle active, update description)
 */
export async function PATCH(req: Request, { params }: RouteParams) {
    const { id } = await params
    const requestId = generateRequestId()
    const auth = await requireApiKey(req, requestId)
    if ("error" in auth) return auth.error
    const { result } = auth

    try {
        const body = await req.json()
        const validation = updateAliasSchema.safeParse(body)

        if (!validation.success) {
            return apiError(
                "Validation failed",
                ErrorCodes.VALIDATION_ERROR,
                requestId,
                400,
                zodErrorToDetails(validation.error)
            )
        }

        const { active, description, label, note, recipient_id, recipient_ids, recipient_email } = validation.data

        const existing = await resolveAlias(id, result.user.id)

        if (!existing) {
            return apiError("Alias not found", ErrorCodes.NOT_FOUND, requestId, 404)
        }

        const aliasId = existing.id

        // Toggle if active is specified, otherwise just update description
        if (active !== undefined && active !== existing.active) {
            await AliasService.toggleAlias(result.user.id, aliasId)
        }

        // Update label — prefer explicit `label` field over `description`
        const labelValue = label !== undefined ? label : description
        const updateData: {
            label?: string | null; note?: string | null;
            recipientId?: string; recipientEmail?: string; recipientIds?: string[];
        } = {}
        if (labelValue !== undefined) updateData.label = labelValue
        if (note !== undefined) updateData.note = note
        // Prefer recipient_ids array over single recipient_id
        if (recipient_ids !== undefined) {
            updateData.recipientIds = recipient_ids
        } else if (recipient_id !== undefined) {
            updateData.recipientId = recipient_id
        }
        if (recipient_email !== undefined) updateData.recipientEmail = recipient_email
        if (Object.keys(updateData).length > 0) {
            await AliasService.updateAlias(result.user.id, aliasId, updateData)
        }

        // Fetch updated alias
        const alias = await getAliasById(aliasId, result.user.id)

        if (!alias) {
            return apiError("Alias not found", ErrorCodes.NOT_FOUND, requestId, 404)
        }

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
            apiSuccess(data, requestId),
            requestId,
            createRateLimitHeaders(result.rateLimit)
        )
    } catch (error: unknown) {
        return apiErrorFromUnknown(error, requestId)
    }
}

/**
 * DELETE /api/v1/alias/:id
 * Permanently delete an alias
 */
export async function DELETE(req: Request, { params }: RouteParams) {
    const { id } = await params
    const requestId = generateRequestId()
    const auth = await requireApiKey(req, requestId)
    if ("error" in auth) return auth.error
    const { result } = auth

    try {
        const alias = await resolveAlias(id, result.user.id)

        if (!alias) {
            return apiError("Alias not found", ErrorCodes.NOT_FOUND, requestId, 404)
        }

        await AliasService.deleteAlias(result.user.id, alias.id)

        return withApiHeaders(
            apiSuccess({ deleted: true }, requestId),
            requestId,
            createRateLimitHeaders(result.rateLimit)
        )
    } catch (error: unknown) {
        return apiErrorFromUnknown(error, requestId)
    }
}
