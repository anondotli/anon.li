/**
 * GET /api/v1/form  — list the caller's forms
 * POST /api/v1/form — create a new form
 */

import { apiError, apiList, apiSuccess, ErrorCodes, zodErrorToDetails } from "@/lib/api-response"
import { checkVaultIdentity, vaultIdentityErrorResponse } from "@/lib/vault/identity"
import { z } from "zod"
import { withPolicy, scopeFromContext } from "@/lib/route-policy"
import { FormService } from "@/lib/services/form"
import { createFormSchema, listFormsQuerySchema } from "@/lib/validations/form"
import { getFormOwnerEntitlements } from "@/lib/services/form-entitlements"
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
    vaultId: vaultIdSchema.optional(),
    // Organization forms are wrapped to this exact shared-vault generation.
    // FormService verifies it again while holding the organization row lock.
    orgKeyGeneration: z.number().int().positive().optional(),
}))

export const GET = withPolicy(
    {
        auth: "api_key_or_session",
        organizationAccess: "subscribed",
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

        const scope = scopeFromContext(ctx)
        const [result, entitlements, submissionsUsedCurrentMonth] = await Promise.all([
            FormService.listForms(scope, parsed.data),
            getFormOwnerEntitlements(scope),
            FormService.countCurrentMonthSubmissions(scope),
        ])
        const { limits } = entitlements

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
                submissions_used_current_month: submissionsUsedCurrentMonth,
                retention_days: limits.retentionDays,
            },
        })
    },
)

export const POST = withPolicy(
    {
        auth: "api_key_or_session",
        organizationAccess: "subscribed",
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

        const scope = scopeFromContext(ctx)
        if (scope.organizationId) {
            if (!validation.data.orgKeyGeneration) {
                return apiError(
                    "Missing team key generation for an organization form",
                    ErrorCodes.VALIDATION_ERROR,
                    ctx.requestId,
                    400,
                )
            }
        } else {
            if (!validation.data.vaultId) {
                return apiError("Missing vault identity", ErrorCodes.VALIDATION_ERROR, ctx.requestId, 400)
            }
            const security = await prisma.userSecurity.findUnique({
                where: { userId: ctx.userId },
                select: { id: true, vaultGeneration: true },
            })
            const identityError = vaultIdentityErrorResponse(
                checkVaultIdentity(security, {
                    vaultId: validation.data.vaultId,
                    vaultGeneration: validation.data.vaultGeneration,
                }),
                ctx.requestId
            )
            if (identityError) return identityError
        }

        try {
            const { vaultId: _vaultId, ...input } = validation.data
            void _vaultId
            const form = await FormService.createForm(scope, input)
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
