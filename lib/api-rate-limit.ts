/**
 * API Rate Limiting - Monthly quota tracking for API key users
 * Uses tier-based limits from ALIAS_LIMITS and DROP_LIMITS configuration
 */
import { getEffectiveTier, type UserSub } from "@/lib/limits"
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

type UserSubscription = UserSub

type LimiterMap = { free: Ratelimit, plus: Ratelimit, pro: Ratelimit }
type QuotaLimitConfig = Record<string, { apiRequests: number }>
type QuotaConfig = { limits: QuotaLimitConfig; limiters: LimiterMap }

const API_QUOTA_CONFIG: Record<ApiQuotaType, QuotaConfig> = {
    alias: {
        limits: ALIAS_LIMITS,
        limiters: {
            free: monthlyApiLimiters.free,
            plus: monthlyApiLimiters.plus,
            pro: monthlyApiLimiters.pro,
        },
    },
    drop: {
        limits: DROP_LIMITS,
        limiters: {
            free: monthlyApiLimiters.dropFree,
            plus: monthlyApiLimiters.dropPlus,
            pro: monthlyApiLimiters.dropPro,
        },
    },
    form: {
        limits: FORM_LIMITS,
        limiters: {
            free: monthlyApiLimiters.formFree,
            plus: monthlyApiLimiters.formPlus,
            pro: monthlyApiLimiters.formPro,
        },
    },
}

async function checkTieredQuota(
    userId: string,
    user: UserSubscription,
    limitConfig: QuotaLimitConfig,
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
    limitConfig: QuotaLimitConfig,
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
    const result = await limiter.getRemaining(userId)
    return {
        success: result.remaining > 0,
        limit: result.limit,
        remaining: result.remaining,
        reset: new Date(result.reset),
    }
}

export async function readApiRateLimit(
    userId: string,
    user: UserSubscription,
): Promise<RateLimitResult> {
    const config = API_QUOTA_CONFIG.alias
    return readTieredQuota(userId, user, config.limits, config.limiters)
}

export async function readDropApiRateLimit(
    userId: string,
    user: UserSubscription,
): Promise<RateLimitResult> {
    const config = API_QUOTA_CONFIG.drop
    return readTieredQuota(userId, user, config.limits, config.limiters)
}

export async function checkApiQuota(
    userId: string,
    user: UserSubscription,
    type: ApiQuotaType,
): Promise<RateLimitResult> {
    const config = API_QUOTA_CONFIG[type]
    return checkTieredQuota(userId, user, config.limits, config.limiters)
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
