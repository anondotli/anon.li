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
import { issueUploadToken } from "@/lib/services/drop-upload-token"
import { getTurnstileError } from "@/lib/turnstile"
import {
    DropOwnerKeyConflictError,
    persistOwnedDropKey,
} from "@/lib/vault/drop-owner-keys"
import {
    vaultGenerationSchema,
    vaultIdSchema,
    wrappedDropKeySchema,
} from "@/lib/vault/validation"

const ownerKeySchema = z.object({
    wrappedKey: wrappedDropKeySchema,
    vaultId: vaultIdSchema,
    vaultGeneration: vaultGenerationSchema,
})

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
    fileCount: z.number().int().positive().optional(),
    turnstileToken: z.string().optional(),
    ownerKey: ownerKeySchema.optional(),
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
        apiQuota: "drop",
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
                    subscriptions: {
                        where: { status: { in: ["active", "trialing"] } },
                        select: {
                            status: true,
                            product: true,
                            tier: true,
                            currentPeriodEnd: true,
                        },
                    },
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
        apiQuota: "drop",
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

        const { ownerKey, turnstileToken, ...dropInput } = validation.data

        if (!ctx.userId) {
            const turnstileError = await getTurnstileError(turnstileToken)
            if (turnstileError) {
                return apiError(turnstileError, ErrorCodes.VALIDATION_ERROR, ctx.requestId, 400)
            }
        }

        // Guests cannot persist vault-wrapped owner keys.
        if (!ctx.userId && ownerKey) {
            return apiError(
                "Owner keys are only available for authenticated drops",
                ErrorCodes.VALIDATION_ERROR,
                ctx.requestId,
                400,
            )
        }

        if (ownerKey && ctx.userId) {
            const security = await prisma.userSecurity.findUnique({
                where: { userId: ctx.userId },
                select: { id: true, vaultGeneration: true },
            })

            if (!security) {
                return apiError("Vault security is not configured", ErrorCodes.NOT_FOUND, ctx.requestId, 404)
            }

            if (security.id !== ownerKey.vaultId) {
                return apiError("Vault identity mismatch", ErrorCodes.CONFLICT, ctx.requestId, 409)
            }

            if (security.vaultGeneration !== ownerKey.vaultGeneration) {
                return apiError("Vault generation mismatch", ErrorCodes.CONFLICT, ctx.requestId, 409)
            }
        }

        const result = await DropService.createDrop(ctx.userId, dropInput)

        if (ownerKey && ctx.userId) {
            try {
                await persistOwnedDropKey(
                    prisma,
                    ctx.userId,
                    result.dropId,
                    ownerKey.wrappedKey,
                    ownerKey.vaultGeneration,
                )
            } catch (error) {
                await prisma.drop.deleteMany({
                    where: {
                        id: result.dropId,
                        userId: ctx.userId,
                        uploadComplete: false,
                    },
                })

                if (error instanceof DropOwnerKeyConflictError) {
                    return apiError("Drop key not found", ErrorCodes.NOT_FOUND, ctx.requestId, 404)
                }

                return apiError("Failed to store drop encryption key", ErrorCodes.INTERNAL_ERROR, ctx.requestId, 500)
            }
        }

        // Guests receive a single-use upload token bound to this drop.
        // The raw token is shown once; only its SHA-256 is stored server-side.
        const uploadToken = ctx.userId ? null : await issueUploadToken(result.dropId)

        return apiSuccess({
            drop_id: result.dropId,
            expires_at: result.expiresAt?.toISOString() || null,
            owner_key_stored: Boolean(ownerKey && ctx.userId),
            upload_token: uploadToken,
        }, ctx.requestId)
    }
)
