/**
 * GET /api/v1/me
 * Get authenticated user info, tier, usage stats
 */

import { EXPIRY_LIMITS } from "@/config/plans"
import { apiError, apiSuccess, ErrorCodes } from "@/lib/api-response"
import { getDisplayPlanLimits, getDropLimits, getEffectiveTier, getProductFromPriceId } from "@/lib/limits"
import { prisma } from "@/lib/prisma"
import { withPolicy } from "@/lib/route-policy"

export const dynamic = "force-dynamic"

export const GET = withPolicy(
    {
        auth: "api_key_or_session",
        rateLimit: "api",
    },
    async (ctx) => {
        if (!ctx.userId) {
            return apiError("Unauthorized - API key or session required", ErrorCodes.UNAUTHORIZED, ctx.requestId, 401)
        }

        type UserResult = {
            id: string
            email: string | null
            name: string | null
            stripePriceId: string | null
            stripeCurrentPeriodEnd: Date | null
            storageUsed: bigint
            createdAt: Date
            _count: { aliases: number; drops: number; domains: number; recipients: number }
        } | null

        const [user, aliasByFormat, security]: [
            UserResult,
            { format: string; _count: { _all: number } }[],
            { id: string } | null,
        ] = await Promise.all([
            prisma.user.findUnique({
                where: { id: ctx.userId },
                select: {
                    id: true,
                    email: true,
                    name: true,
                    stripePriceId: true,
                    stripeCurrentPeriodEnd: true,
                    storageUsed: true,
                    createdAt: true,
                    _count: {
                        select: {
                            aliases: true,
                            drops: { where: { deletedAt: null } },
                            domains: true,
                            recipients: true,
                        },
                    },
                },
            }),
            prisma.alias.groupBy({
                by: ["format"],
                where: { userId: ctx.userId },
                _count: { _all: true },
            }) as unknown as Promise<{ format: string; _count: { _all: number } }[]>,
            prisma.userSecurity.findUnique({
                where: { userId: ctx.userId },
                select: { id: true },
            }),
        ])

        if (!user) {
            return apiError("User not found", ErrorCodes.NOT_FOUND, ctx.requestId, 404)
        }

        const tier = getEffectiveTier(user)
        const aliasLimits = getDisplayPlanLimits(user)
        const dropLimits = getDropLimits(user)
        const product = getProductFromPriceId(user.stripePriceId)
        const randomCount = aliasByFormat.find((group) => group.format === "RANDOM")?._count._all ?? 0
        const customCount = aliasByFormat.find((group) => group.format === "CUSTOM")?._count._all ?? 0
        const expiryDays = tier === "free"
            ? EXPIRY_LIMITS.free
            : tier === "plus"
                ? EXPIRY_LIMITS.plus
                : EXPIRY_LIMITS.pro

        return apiSuccess({
            id: user.id,
            email: user.email,
            name: user.name,
            tier,
            product,
            created_at: user.createdAt.toISOString(),
            aliases: {
                random: { used: randomCount, limit: aliasLimits.random },
                custom: { used: customCount, limit: aliasLimits.custom },
            },
            domains: {
                used: user._count.domains,
                limit: aliasLimits.domains,
            },
            recipients: {
                used: user._count.recipients,
                limit: aliasLimits.recipients,
            },
            drops: {
                count: user._count.drops,
            },
            storage: {
                used: (user.storageUsed || BigInt(0)).toString(),
                limit: dropLimits.maxStorage.toString(),
            },
            limits: {
                max_file_size: dropLimits.maxFileSize,
                max_expiry_days: expiryDays,
                api_requests: aliasLimits.apiRequests,
            },
            features: dropLimits.features,
            vault_configured: Boolean(security),
        }, ctx.requestId)
    },
)
