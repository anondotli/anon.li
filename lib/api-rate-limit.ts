/**
 * API Rate Limiting - Monthly quota tracking for API key users
 * Uses tier-based limits from ALIAS_LIMITS and DROP_LIMITS configuration
 */
import { getEffectiveTier } from "@/lib/limits"
import { ALIAS_LIMITS, DROP_LIMITS } from "@/config/plans"
import { monthlyApiLimiters } from "@/lib/rate-limit"
import type { Ratelimit } from "@upstash/ratelimit"

export interface RateLimitResult {
    success: boolean
    limit: number
    remaining: number
    reset: Date
}

type UserSubscription = { stripePriceId?: string | null, stripeCurrentPeriodEnd?: Date | null }

type LimiterMap = { free: Ratelimit | null, plus: Ratelimit | null, pro: Ratelimit | null }

async function checkTieredQuota(
    userId: string,
    user: UserSubscription,
    limitConfig: Record<string, { apiRequests: number }>,
    limiterMap: LimiterMap,
): Promise<RateLimitResult> {
    const tier = getEffectiveTier(user)
    const tierConfig = limitConfig[tier]
    if (!tierConfig) {
        return { success: true, limit: -1, remaining: -1, reset: new Date() }
    }
    const limit = tierConfig.apiRequests

    if (limit === -1) {
        return { success: true, limit: -1, remaining: -1, reset: new Date() }
    }

    const limiter = limiterMap[tier]
    if (!limiter) {
        return { success: true, limit, remaining: limit, reset: new Date() }
    }

    const result = await limiter.limit(userId)
    return {
        success: result.success,
        limit: result.limit,
        remaining: result.remaining,
        reset: new Date(result.reset),
    }
}

export async function checkApiRateLimit(
    userId: string,
    user: UserSubscription,
): Promise<RateLimitResult> {
    return checkTieredQuota(userId, user, ALIAS_LIMITS, {
        free: monthlyApiLimiters.free,
        plus: monthlyApiLimiters.plus,
        pro: monthlyApiLimiters.pro,
    })
}

export async function checkDropApiRateLimit(
    userId: string,
    user: UserSubscription,
): Promise<RateLimitResult> {
    return checkTieredQuota(userId, user, DROP_LIMITS, {
        free: monthlyApiLimiters.dropFree,
        plus: monthlyApiLimiters.dropPlus,
        pro: monthlyApiLimiters.dropPro,
    })
}

/**
 * Enforce monthly quota for a user. Throws RateLimitError if exceeded.
 * Used by service-layer methods so quota is enforced regardless of entry point.
 */
export async function enforceMonthlyQuota(
    userId: string,
    type: "alias" | "drop",
    user: { stripePriceId?: string | null; stripeCurrentPeriodEnd?: Date | null }
): Promise<void> {
    const checker = type === "alias" ? checkApiRateLimit : checkDropApiRateLimit
    const result = await checker(userId, user)
    if (!result.success) {
        const { RateLimitError } = await import("@/lib/api-error-utils")
        throw new RateLimitError("Monthly request limit exceeded. Upgrade your plan for more requests.")
    }
}

/**
 * Create rate limit headers for API responses
 */
export function createRateLimitHeaders(result: RateLimitResult): Headers {
    const headers = new Headers()

    if (result.limit !== -1) {
        headers.set("X-RateLimit-Limit", result.limit.toString())
        headers.set("X-RateLimit-Remaining", Math.max(0, result.remaining).toString())
        headers.set("X-RateLimit-Reset", result.reset.getTime().toString())
    } else {
        headers.set("X-RateLimit-Limit", "unlimited")
    }

    return headers
}
