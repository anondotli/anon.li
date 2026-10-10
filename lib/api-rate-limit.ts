/**
 * API Rate Limiting - Monthly quota tracking for API key users
 * Uses tier-based limits from ALIAS_LIMITS and DROP_LIMITS configuration.
 *
 * The tier is resolved for the PRODUCT the quota bucket belongs to (the
 * route's `apiQuota` / the MCP tool's `quota`): a Drop-only Pro subscriber gets
 * Pro Drop quota but the free Alias quota — the same per-product resolution
 * the resource limits use. bundle/business plans grant every product.
 */
import { getProductTier, type UserSub } from "@/lib/limits"
import { ALIAS_LIMITS, DROP_LIMITS, FORM_LIMITS } from "@/config/plans"
import { monthlyApiLimiters } from "@/lib/rate-limit"
import type { Ratelimit } from "@upstash/ratelimit"
import { createLogger } from "@/lib/logger"

const logger = createLogger("ApiRateLimit")

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
    product: ApiQuotaType,
    limitConfig: QuotaLimitConfig,
    limiterMap: LimiterMap,
): Promise<RateLimitResult> {
    const tier = getProductTier(user, product)
    const tierConfig = limitConfig[tier]
    if (!tierConfig) {
        return { success: true, limit: -1, remaining: -1, reset: new Date() }
    }
    const limit = tierConfig.apiRequests

    if (limit === -1) {
        return { success: true, limit: -1, remaining: -1, reset: new Date() }
    }

    const limiter = limiterMap[tier]
    let result: Awaited<ReturnType<Ratelimit["limit"]>>
    try {
        result = await limiter.limit(userId)
    } catch (error) {
        // Fail open like the per-request limiters (lib/rate-limit.ts): a Redis
        // outage must not turn every API-key request into a 500.
        logger.error("Monthly API quota check failed (Redis may be down)", { tier, error })
        return { success: true, limit: -1, remaining: -1, reset: new Date() }
    }
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
    product: ApiQuotaType,
    limitConfig: QuotaLimitConfig,
    limiterMap: LimiterMap,
): Promise<RateLimitResult> {
    const tier = getProductTier(user, product)
    const tierConfig = limitConfig[tier]
    if (!tierConfig) {
        return { success: true, limit: -1, remaining: -1, reset: new Date() }
    }
    const limit = tierConfig.apiRequests

    if (limit === -1) {
        return { success: true, limit: -1, remaining: -1, reset: new Date() }
    }

    const limiter = limiterMap[tier]
    let result: Awaited<ReturnType<Ratelimit["getRemaining"]>>
    try {
        result = await limiter.getRemaining(userId)
    } catch (error) {
        logger.error("Monthly API quota read failed (Redis may be down)", { tier, error })
        return { success: true, limit: -1, remaining: -1, reset: new Date() }
    }
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
    return readTieredQuota(userId, user, "alias", config.limits, config.limiters)
}

export async function readDropApiRateLimit(
    userId: string,
    user: UserSubscription,
): Promise<RateLimitResult> {
    const config = API_QUOTA_CONFIG.drop
    return readTieredQuota(userId, user, "drop", config.limits, config.limiters)
}

/** Read (without consuming) the monthly quota of any product bucket. */
export async function readApiQuota(
    userId: string,
    user: UserSubscription,
    type: ApiQuotaType,
): Promise<RateLimitResult> {
    const config = API_QUOTA_CONFIG[type]
    return readTieredQuota(userId, user, type, config.limits, config.limiters)
}

/**
 * Consume one request from the monthly quota bucket of `type` — the product
 * the calling route/tool belongs to, which also selects the tier.
 */
export async function checkApiQuota(
    userId: string,
    user: UserSubscription,
    type: ApiQuotaType,
): Promise<RateLimitResult> {
    const config = API_QUOTA_CONFIG[type]
    return checkTieredQuota(userId, user, type, config.limits, config.limiters)
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
