/**
 * GET /api/v1/me
 * Get authenticated user info, tier, usage stats
 */

import { EXPIRY_LIMITS } from "@/config/plans"
import { apiError, apiSuccess, ErrorCodes } from "@/lib/api-response"
import { getDisplayPlanLimits, getDropLimits, getEffectiveTier } from "@/lib/limits"
import { DAY_MS } from "@/lib/constants"
import { isOrgScope } from "@/lib/ownership"
import { prisma } from "@/lib/prisma"
import { scopeFromContext, withPolicy } from "@/lib/route-policy"

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
        if (ctx.apiKeyId && isOrgScope(scopeFromContext(ctx))) {
            return apiError("A personal API key is required", ErrorCodes.FORBIDDEN, ctx.requestId, 403)
        }

        const [user, aliasByFormat, security] = await Promise.all([
            prisma.user.findUnique({
                where: { id: ctx.userId },
                select: {
                    id: true,
                    email: true,
                    name: true,
                    storageUsed: true,
                    createdAt: true,
                    referralPlusUntil: true,
                    _count: {
                        select: {
                            aliases: { where: { organizationId: null } },
                            drops: { where: { organizationId: null, deletedAt: null } },
                            domains: { where: { organizationId: null } },
                            recipients: { where: { organizationId: null } },
                        },
                    },
                },
            }),
            prisma.alias.groupBy({
                by: ["format"],
                where: { userId: ctx.userId, organizationId: null },
                _count: { _all: true },
            }),
            prisma.userSecurity.findUnique({
                where: { userId: ctx.userId },
                select: { id: true },
            }),
        ])

        if (!user) {
            return apiError("User not found", ErrorCodes.NOT_FOUND, ctx.requestId, 404)
        }

        const limitContext = {
            subscriptions: ctx.user?.subscriptions ?? [],
            referralPlusUntil: user.referralPlusUntil,
        }
        const tier = getEffectiveTier(limitContext)
        const aliasLimits = getDisplayPlanLimits(limitContext)
        const dropLimits = getDropLimits(limitContext)
        const now = Date.now()
        const product = limitContext.subscriptions
            .filter((s) => !s.currentPeriodEnd || s.currentPeriodEnd.getTime() + DAY_MS > now)
            .find((s) => s.tier === "plus" || s.tier === "pro")?.product ?? null
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
