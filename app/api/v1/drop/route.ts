/**
 * GET /api/v1/drop - List drops for authenticated user
 * POST /api/v1/drop - Create a new drop (file collection)
 *
 * CLI-friendly API with client-side E2EE
 */

import { z } from "zod"

import { apiError, apiList, apiSuccess, ErrorCodes, zodErrorToDetails } from "@/lib/api-response"
import { getDropLimits } from "@/lib/limits"
import { prisma } from "@/lib/prisma"
import { getClientIp } from "@/lib/rate-limit"
import { withPolicy } from "@/lib/route-policy"
import { DropService, type DropListItem } from "@/lib/services/drop"
import { validateTurnstileToken } from "@/lib/turnstile"

const createDropSchema = z.object({
    iv: z.string().regex(/^[A-Za-z0-9_-]{16}$/, "IV must be 16 base64url characters"),
    encryptedTitle: z.string().max(1024).optional(),
    encryptedMessage: z.string().max(4096).optional(),
    expiry: z.number().min(1).max(30).optional(),
    maxDownloads: z.number().min(1).optional(),
    customKey: z.boolean().optional(),
    salt: z.string().length(43).optional(),
    customKeyData: z.string().min(70).max(512).optional(),
    customKeyIv: z.string().length(16).optional(),
    hideBranding: z.boolean().optional(),
    notifyOnDownload: z.boolean().optional(),
    fileCount: z.number().int().positive(),
    turnstileToken: z.string().nullish().transform((val) => val ?? undefined),
}).refine((data) => {
    if (data.customKey) {
        return !!data.salt && !!data.customKeyData && !!data.customKeyIv
    }
    return true
}, {
    message: "Custom key drops must include salt, encrypted key, and IV",
    path: ["customKey"],
})

export const GET = withPolicy(
    {
        auth: "api_key_or_session",
        rateLimit: "dropList",
    },
    async (ctx) => {
        if (!ctx.userId) {
            return apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, ctx.requestId, 401)
        }

        const url = new URL(ctx.request.url)
        const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 1), 100)
        const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0)

        const [result, user] = await Promise.all([
            DropService.listDrops(ctx.userId, { limit, offset }),
            prisma.user.findUnique({
                where: { id: ctx.userId },
                select: {
                    storageUsed: true,
                    stripePriceId: true,
                    stripeCurrentPeriodEnd: true,
                },
            }),
        ])

        const limits = getDropLimits(user)
        const storageUsed = user?.storageUsed || BigInt(0)
        const storageLimit = BigInt(limits.maxStorage)

        const data = result.drops.map((drop: DropListItem) => ({
            ...drop,
            expires_at: drop.expiresAt?.toISOString() || null,
            created_at: drop.createdAt.toISOString(),
        }))

        return apiList(data, ctx.requestId, { total: result.total, limit, offset }, {
            storage: {
                used: storageUsed.toString(),
                limit: storageLimit.toString(),
            },
        })
    }
)

export const POST = withPolicy(
    {
        auth: "optional_api_key_or_session",
        requireCsrf: true,
        checkBan: "upload",
        rateLimit: "dropCreate",
        rateLimitIdentifier: async (ctx) => ctx.userId ?? await getClientIp(),
    },
    async (ctx) => {
        const body = await ctx.request.json()
        const validation = createDropSchema.safeParse(body)

        if (!validation.success) {
            return apiError(
                "Validation failed",
                ErrorCodes.VALIDATION_ERROR,
                ctx.requestId,
                400,
                zodErrorToDetails(validation.error)
            )
        }

        if (!ctx.userId && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
            const token = validation.data.turnstileToken
            if (!token) {
                return apiError(
                    "Missing Turnstile token. Please refresh.",
                    ErrorCodes.VALIDATION_ERROR,
                    ctx.requestId,
                    400
                )
            }

            const isValid = await validateTurnstileToken(token)
            if (!isValid) {
                return apiError(
                    "Turnstile verification failed. Are you a robot?",
                    ErrorCodes.VALIDATION_ERROR,
                    ctx.requestId,
                    400
                )
            }
        }

        const result = await DropService.createDrop(ctx.userId, validation.data)

        return apiSuccess({
            drop_id: result.dropId,
            session_token: result.sessionToken,
            expires_at: result.expiresAt?.toISOString() || null,
        }, ctx.requestId)
    }
)
