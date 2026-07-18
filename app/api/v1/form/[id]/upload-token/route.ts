/**
 * POST /api/v1/form/[id]/upload-token
 * Issues a Drop + upload token scoped to a form submission.
 *
 * The staging drop inherits the form's tenant. Anonymous submitters are
 * allowed, but the token can only mutate this one form-bound drop.
 */

import { z } from "zod"

import { apiError, apiSuccess, ErrorCodes, zodErrorToDetails } from "@/lib/api-response"
import { withPolicy } from "@/lib/route-policy"
import { FormService } from "@/lib/services/form"
import { DropService } from "@/lib/services/drop"
import { orgScope, personalScope, type OwnerScope } from "@/lib/ownership"
import { isOrgRole } from "@/lib/auth-permissions"
import { FORM_UPLOAD_TOKEN_TTL_MS, issueUploadToken } from "@/lib/services/drop-upload-token"
import { validateFormUploadManifest } from "@/lib/services/form-upload"
import { prisma } from "@/lib/prisma"
import { NotFoundError, ForbiddenError, UpgradeRequiredError, ValidationError } from "@/lib/api-error-utils"
import { getClientIp, rateLimit } from "@/lib/rate-limit"
import { validateTurnstileToken } from "@/lib/turnstile"

const MAX_LIVE_FORM_STAGING_DROPS = 10

interface RouteParams {
    params: Promise<{ id: string }>
}

const bodySchema = z.object({
    iv: z.string().regex(/^[A-Za-z0-9_-]{16}$/, "IV must be 16 base64url characters"),
    files: z.array(z.object({
        fieldId: z.string().min(1).max(64),
        size: z.number().int().positive(),
        mimeType: z.string().min(1).max(200),
    })).min(1).max(20),
    fileCount: z.number().int().min(1).max(20).optional(),
    expiry: z.number().int().min(1).max(30).optional(),
    turnstileToken: z.string().min(1).max(2048).optional(),
    customKeyProof: z.string().regex(/^[A-Za-z0-9_-]+$/).min(1).max(512).optional(),
})

export const POST = withPolicy<RouteParams>(
    {
        auth: "optional_api_key_or_session",
        rateLimit: "formSubmitAuth",
        rateLimitIdentifier: async (ctx) => ctx.userId ?? await getClientIp(),
    },
    async (ctx, routeContext) => {
        const { id } = await routeContext.params
        const clientIp = await getClientIp()
        const perIpLimited = await rateLimit("formSubmit", clientIp)
        if (perIpLimited) return perIpLimited
        const targetLimited = await rateLimit("formUploadTarget", id)
        if (targetLimited) return targetLimited
        const body = await ctx.request.json().catch(() => null)
        const parsed = bodySchema.safeParse(body)
        if (!parsed.success) {
            return apiError("Validation failed", ErrorCodes.VALIDATION_ERROR, ctx.requestId, 400, zodErrorToDetails(parsed.error))
        }

        let form
        try {
            form = await FormService.getPublicForm(id)
        } catch (error) {
            if (error instanceof NotFoundError) {
                return apiError("Form not found", ErrorCodes.NOT_FOUND, ctx.requestId, 404)
            }
            const status = (error as { status?: number }).status
            if (status === 410) return apiError("Form has been taken down", ErrorCodes.GONE, ctx.requestId, 410)
            throw error
        }

        if (!form.allowFileUploads) {
            return apiError("This form does not accept file uploads", ErrorCodes.FORBIDDEN, ctx.requestId, 403)
        }
        if (!form.active) {
            return apiError("Form is closed", ErrorCodes.FORBIDDEN, ctx.requestId, 403)
        }
        if (form.closesAt && form.closesAt.getTime() < Date.now()) {
            return apiError("Form has closed", ErrorCodes.FORBIDDEN, ctx.requestId, 403)
        }
        if (!parsed.data.turnstileToken) {
            return apiError("Verification required", ErrorCodes.VALIDATION_ERROR, ctx.requestId, 400)
        }
        const isValid = await validateTurnstileToken(parsed.data.turnstileToken)
        if (!isValid) {
            return apiError("Bot verification failed", ErrorCodes.VALIDATION_ERROR, ctx.requestId, 400)
        }

        const formRow = await prisma.form.findUnique({
            where: { id },
            select: { userId: true, organizationId: true },
        })
        if (!formRow) {
            return apiError("Form owner missing", ErrorCodes.NOT_FOUND, ctx.requestId, 404)
        }

        let uploadOwnerScope: OwnerScope
        if (formRow.organizationId) {
            const members = await prisma.member.findMany({
                where: { organizationId: formRow.organizationId },
                select: { userId: true, role: true, createdAt: true },
                orderBy: { createdAt: "asc" },
            })
            const member = members.find((candidate) => candidate.userId === formRow.userId)
                ?? members.find((candidate) => candidate.role === "owner")
                ?? members.find((candidate) => candidate.role === "admin")
                ?? members[0]
            if (!member || !isOrgRole(member.role)) {
                return apiError("Form owner missing", ErrorCodes.NOT_FOUND, ctx.requestId, 404)
            }
            uploadOwnerScope = orgScope(member.userId, formRow.organizationId, member.role)
        } else if (formRow.userId) {
            uploadOwnerScope = personalScope(formRow.userId)
        } else {
            return apiError("Form owner missing", ErrorCodes.NOT_FOUND, ctx.requestId, 404)
        }

        try {
            await FormService.assertAcceptingSubmissions(
                id,
                parsed.data.customKeyProof,
                { fileUpload: true },
            )
            await validateFormUploadManifest(id, parsed.data.files)

            const liveStaging = await prisma.uploadToken.count({
                where: {
                    formId: id,
                    expiresAt: { gt: new Date() },
                },
            })
            if (liveStaging >= MAX_LIVE_FORM_STAGING_DROPS) {
                throw new ValidationError("This form has too many file uploads in progress. Please try again later.")
            }

            const result = await DropService.createDrop(uploadOwnerScope, {
                iv: parsed.data.iv,
                fileCount: parsed.data.files.length,
                expiry: parsed.data.expiry ?? 1,
            })

            let rawToken: string
            try {
                // Bind the upload token to this form so cleanup / auditing can
                // scope tokens to a specific form and detect abuse.
                rawToken = await issueUploadToken(result.dropId, FORM_UPLOAD_TOKEN_TTL_MS)
                const [staged, bound] = await prisma.$transaction([
                    prisma.drop.updateMany({
                        where: { id: result.dropId, deletedAt: null },
                        data: { formStagingId: id },
                    }),
                    prisma.uploadToken.updateMany({
                        where: { dropId: result.dropId },
                        data: { formId: id },
                    }),
                ])
                if (staged.count !== 1 || bound.count !== 1) {
                    throw new Error("Unable to bind form upload token")
                }
            } catch (error) {
                await DropService.deleteDrop(result.dropId, uploadOwnerScope).catch(() => undefined)
                throw error
            }

            return apiSuccess({
                drop_id: result.dropId,
                upload_token: rawToken,
                expires_at: result.expiresAt?.toISOString() ?? null,
            }, ctx.requestId)
        } catch (error) {
            if (error instanceof UpgradeRequiredError) {
                return apiError(error.message, ErrorCodes.PAYMENT_REQUIRED, ctx.requestId, 402)
            }
            if (error instanceof ForbiddenError) {
                return apiError(error.message, ErrorCodes.FORBIDDEN, ctx.requestId, 403)
            }
            if (error instanceof ValidationError) {
                return apiError(error.message, ErrorCodes.VALIDATION_ERROR, ctx.requestId, 400)
            }
            throw error
        }
    },
)
