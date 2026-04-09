/**
 * GET /api/v1/me
 * Get authenticated user info, tier, usage stats
 */

import { validateRequest } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getEffectiveTier, getProductFromPriceId } from "@/lib/limits";
import { getDisplayPlanLimits, getDropLimits } from "@/lib/limits";
import { EXPIRY_LIMITS } from "@/config/plans";
import {
    generateRequestId,
    apiSuccess,
    apiError,
    apiRateLimitError,
    withApiHeaders,
    ErrorCodes,
} from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    const requestId = generateRequestId();

    const result = await validateRequest(req);
    if (!result) {
        return apiError("Unauthorized - API key or session required", ErrorCodes.UNAUTHORIZED, requestId, 401);
    }

    if (result.rateLimit && !result.rateLimit.success) {
        const isMonthly = 'limit' in result.rateLimit && (result.rateLimit.limit === -1 || result.rateLimit.limit > 100);
        return apiRateLimitError(requestId, result.rateLimit.reset, isMonthly);
    }

    const userId = result.user!.id;

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

    const [user, aliasByFormat]: [UserResult, { format: string; _count: { _all: number } }[]] = await Promise.all([
        prisma.user.findUnique({
            where: { id: userId },
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
        (prisma.alias.groupBy({
            by: ["format"],
            where: { userId },
            _count: { _all: true },
        }) as unknown as Promise<{ format: string; _count: { _all: number } }[]>),
    ]);

    if (!user) {
        return apiError("User not found", ErrorCodes.NOT_FOUND, requestId, 404);
    }

    const tier = getEffectiveTier(user);
    const aliasLimits = getDisplayPlanLimits(user);
    const dropLimits = getDropLimits(user);
    const product = getProductFromPriceId(user.stripePriceId);

    const randomCount = aliasByFormat.find(g => g.format === "RANDOM")?._count._all ?? 0;
    const customCount = aliasByFormat.find(g => g.format === "CUSTOM")?._count._all ?? 0;

    const expiryDays = tier === "free" ? EXPIRY_LIMITS.free : tier === "plus" ? EXPIRY_LIMITS.plus : EXPIRY_LIMITS.pro;

    const data = {
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
    };

    return withApiHeaders(
        apiSuccess(data, requestId),
        requestId,
        result.rateLimitHeaders
    );
}
