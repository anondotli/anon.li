/**
 * GET /api/v1/form  — list the caller's forms
 * POST /api/v1/form — create a new form
 */

import { apiError, apiList, apiSuccess, ErrorCodes, zodErrorToDetails } from "@/lib/api-response"
import { z } from "zod"
import { withPolicy } from "@/lib/route-policy"
import { FormService } from "@/lib/services/form"
import { createFormSchema, listFormsQuerySchema } from "@/lib/validations/form"
import { getFormLimitsAsync } from "@/lib/limits"
import { prisma } from "@/lib/prisma"
import { UpgradeRequiredError } from "@/lib/api-error-utils"
import {
    vaultGenerationSchema,
    vaultIdSchema,
    wrappedFormKeySchema,
} from "@/lib/vault/validation"

const createBodySchema = createFormSchema.and(z.object({
    wrappedPrivateKey: wrappedFormKeySchema,
    vaultGeneration: vaultGenerationSchema,
    vaultId: vaultIdSchema,
}))

export const GET = withPolicy(
    {
        auth: "api_key_or_session",
        apiQuota: "form",
        rateLimit: "formList",
    },
    async (ctx) => {
        if (!ctx.userId) {
            return apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, ctx.requestId, 401)
        }
        const url = new URL(ctx.request.url)
        const parsed = listFormsQuerySchema.safeParse({
            limit: url.searchParams.get("limit"),
            offset: url.searchParams.get("offset"),
            includeDeleted: url.searchParams.get("includeDeleted"),
        })
        if (!parsed.success) {
            return apiError("Invalid query", ErrorCodes.VALIDATION_ERROR, ctx.requestId, 400, zodErrorToDetails(parsed.error))
        }

        const [result, limits] = await Promise.all([
            FormService.listForms(ctx.userId, parsed.data),
            getFormLimitsAsync(ctx.userId),
        ])

        const data = result.forms.map((f) => ({
            id: f.id,
            title: f.title,
            description: f.description,
            active: f.active,
            disabled_by_user: f.disabledByUser,
            taken_down: f.takenDown,
            allow_file_uploads: f.allowFileUploads,
            submissions_count: f.submissionsCount,
            max_submissions: f.maxSubmissions,
            closes_at: f.closesAt?.toISOString() ?? null,
            hide_branding: f.hideBranding,
            notify_on_submission: f.notifyOnSubmission,
            created_at: f.createdAt.toISOString(),
            updated_at: f.updatedAt.toISOString(),
        }))

        return apiList(data, ctx.requestId, { total: result.total, limit: parsed.data.limit, offset: parsed.data.offset }, {
            plan: {
                forms_limit: limits.forms,
                submissions_per_month: limits.submissionsPerMonth,
                retention_days: limits.retentionDays,
            },
        })
    },
)

export const POST = withPolicy(
    {
        auth: "api_key_or_session",
        apiQuota: "form",
        requireCsrf: true,
        checkBan: "upload",
        rateLimit: "formCreate",
    },
    async (ctx) => {
        if (!ctx.userId) {
            return apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, ctx.requestId, 401)
        }

        const body = await ctx.request.json().catch(() => null)
        const validation = createBodySchema.safeParse(body)
        if (!validation.success) {
            return apiError("Validation failed", ErrorCodes.VALIDATION_ERROR, ctx.requestId, 400, zodErrorToDetails(validation.error))
        }

        const security = await prisma.userSecurity.findUnique({
            where: { userId: ctx.userId },
            select: { id: true, vaultGeneration: true },
        })
        if (!security) {
            return apiError("Vault security is not configured", ErrorCodes.NOT_FOUND, ctx.requestId, 404)
        }
        if (security.id !== validation.data.vaultId) {
            return apiError("Vault identity mismatch", ErrorCodes.CONFLICT, ctx.requestId, 409)
        }
        if (security.vaultGeneration !== validation.data.vaultGeneration) {
            return apiError("Vault generation mismatch", ErrorCodes.CONFLICT, ctx.requestId, 409)
        }

        try {
            const { vaultId: _vaultId, ...input } = validation.data
            void _vaultId
            const form = await FormService.createForm(ctx.userId, input)
            return apiSuccess({
                id: form.id,
                title: form.title,
                public_key: form.publicKey,
                created_at: form.createdAt.toISOString(),
            }, ctx.requestId)
        } catch (error) {
            if (error instanceof UpgradeRequiredError) {
                return apiError(error.message, ErrorCodes.PAYMENT_REQUIRED, ctx.requestId, 402)
            }
            throw error
        }
    },
)
