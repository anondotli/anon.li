/**
 * GET /api/v1/form/[id]  — public form metadata (used by /f/[id])
 * PATCH /api/v1/form/[id]?action=update|toggle  — update or toggle
 * DELETE /api/v1/form/[id]  — soft-delete
 */

import { NextResponse } from "next/server"

import { apiError, apiSuccess, ErrorCodes, generateRequestId, zodErrorToDetails } from "@/lib/api-response"
import { withPolicy } from "@/lib/route-policy"
import { FormService } from "@/lib/services/form"
import { updateFormSchema } from "@/lib/validations/form"
import { getClientIp, rateLimit } from "@/lib/rate-limit"
import { UpgradeRequiredError } from "@/lib/api-error-utils"

interface RouteParams {
    params: Promise<{ id: string }>
}

const getHandler = withPolicy<RouteParams>(
    {
        auth: "none",
        rateLimit: "formList",
        rateLimitIdentifier: async () => getClientIp(),
    },
    async (_ctx, routeContext) => {
        const { id } = await routeContext!.params
        const perIp = await rateLimit("formList", `${await getClientIp()}:${id}`)
        if (perIp) return perIp

        try {
            const form = await FormService.getPublicForm(id)
            return NextResponse.json({
                id: form.id,
                title: form.title,
                description: form.description,
                schema: form.schema,
                public_key: form.publicKey,
                custom_key: form.customKey,
                salt: form.salt,
                custom_key_data: form.customKeyData,
                custom_key_iv: form.customKeyIv,
                active: form.active,
                hide_branding: form.hideBranding,
                closes_at: form.closesAt?.toISOString() ?? null,
                allow_file_uploads: form.allowFileUploads,
                max_file_size_override: form.maxFileSizeOverride,
            })
        } catch (error) {
            const status = (error as { status?: number }).status
            if (status === 410) return NextResponse.json({ error: "Form has been taken down" }, { status: 410 })
            return NextResponse.json({ error: "Form not found" }, { status: 404 })
        }
    },
)

export const GET = getHandler

export const DELETE = withPolicy<RouteParams>(
    {
        auth: "api_key_or_session",
        apiQuota: "form",
        requireCsrf: true,
        rateLimit: "formOps",
    },
    async (ctx, routeContext) => {
        const { id } = await routeContext!.params
        await FormService.deleteForm(id, ctx.userId!)
        return apiSuccess({ deleted: true, id }, ctx.requestId)
    },
)

const updateHandler = withPolicy<RouteParams>(
    {
        auth: "api_key_or_session",
        apiQuota: "form",
        requireCsrf: true,
        rateLimit: "formOps",
    },
    async (ctx, routeContext) => {
        const { id } = await routeContext!.params
        const body = await ctx.request.json().catch(() => null)
        const parsed = updateFormSchema.safeParse(body)
        if (!parsed.success) {
            return apiError("Validation failed", ErrorCodes.VALIDATION_ERROR, ctx.requestId, 400, zodErrorToDetails(parsed.error))
        }
        try {
            const updated = await FormService.updateForm(id, ctx.userId!, parsed.data)
            return apiSuccess({
                id: updated.id,
                updated_at: updated.updatedAt.toISOString(),
            }, ctx.requestId)
        } catch (error) {
            if (error instanceof UpgradeRequiredError) {
                return apiError(error.message, ErrorCodes.PAYMENT_REQUIRED, ctx.requestId, 402)
            }
            throw error
        }
    },
)

const toggleHandler = withPolicy<RouteParams>(
    {
        auth: "api_key_or_session",
        apiQuota: "form",
        requireCsrf: true,
        rateLimit: "formOps",
    },
    async (ctx, routeContext) => {
        const { id } = await routeContext!.params
        const disabled = await FormService.toggleForm(id, ctx.userId!)
        return apiSuccess({ disabled }, ctx.requestId)
    },
)

export async function PATCH(request: Request, routeContext: RouteParams) {
    const action = new URL(request.url).searchParams.get("action")
    if (action === "toggle") return toggleHandler(request, routeContext)
    if (!action || action === "update") return updateHandler(request, routeContext)
    const requestId = generateRequestId()
    return apiError("Invalid action. Use ?action=update or ?action=toggle", ErrorCodes.INVALID_REQUEST, requestId, 400)
}
