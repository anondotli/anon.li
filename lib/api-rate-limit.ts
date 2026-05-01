/**
 * API Rate Limiting - Monthly quota tracking for API key users
 * Uses tier-based limits from ALIAS_LIMITS and DROP_LIMITS configuration
 */
import { getEffectiveTier } from "@/lib/limits"
import { ALIAS_LIMITS, DROP_LIMITS, FORM_LIMITS } from "@/config/plans"
import { monthlyApiLimiters } from "@/lib/rate-limit"
import type { Ratelimit } from "@upstash/ratelimit"

export interface RateLimitResult {
    success: boolean
    limit: number
    remaining: number
    reset: Date
}

export type ApiQuotaType = "alias" | "drop" | "form"

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

async function readTieredQuota(
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

    const result = await limiter.getRemaining(userId)
    return {
        success: result.remaining > 0,
        limit: result.limit,
        remaining: result.remaining,
        reset: new Date(result.reset),
    }
}

async function checkApiRateLimit(
    userId: string,
    user: UserSubscription,
): Promise<RateLimitResult> {
    return checkTieredQuota(userId, user, ALIAS_LIMITS, {
        free: monthlyApiLimiters.free,
        plus: monthlyApiLimiters.plus,
        pro: monthlyApiLimiters.pro,
    })
}

async function checkDropApiRateLimit(
    userId: string,
    user: UserSubscription,
): Promise<RateLimitResult> {
    return checkTieredQuota(userId, user, DROP_LIMITS, {
        free: monthlyApiLimiters.dropFree,
        plus: monthlyApiLimiters.dropPlus,
        pro: monthlyApiLimiters.dropPro,
    })
}

async function checkFormApiRateLimit(
    userId: string,
    user: UserSubscription,
): Promise<RateLimitResult> {
    return checkTieredQuota(userId, user, FORM_LIMITS, {
        free: monthlyApiLimiters.formFree,
        plus: monthlyApiLimiters.formPlus,
        pro: monthlyApiLimiters.formPro,
    })
}

export async function readApiRateLimit(
    userId: string,
    user: UserSubscription,
): Promise<RateLimitResult> {
    return readTieredQuota(userId, user, ALIAS_LIMITS, {
        free: monthlyApiLimiters.free,
        plus: monthlyApiLimiters.plus,
        pro: monthlyApiLimiters.pro,
    })
}

export async function readDropApiRateLimit(
    userId: string,
    user: UserSubscription,
): Promise<RateLimitResult> {
    return readTieredQuota(userId, user, DROP_LIMITS, {
        free: monthlyApiLimiters.dropFree,
        plus: monthlyApiLimiters.dropPlus,
        pro: monthlyApiLimiters.dropPro,
    })
}

export async function readFormApiRateLimit(
    userId: string,
    user: UserSubscription,
): Promise<RateLimitResult> {
    return readTieredQuota(userId, user, FORM_LIMITS, {
        free: monthlyApiLimiters.formFree,
        plus: monthlyApiLimiters.formPlus,
        pro: monthlyApiLimiters.formPro,
    })
}

export async function checkApiQuota(
    userId: string,
    user: UserSubscription,
    type: ApiQuotaType,
): Promise<RateLimitResult> {
    if (type === "alias") return checkApiRateLimit(userId, user)
    if (type === "drop") return checkDropApiRateLimit(userId, user)
    return checkFormApiRateLimit(userId, user)
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
