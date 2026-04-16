import { auth } from "@/auth"
import { getAuthApiKeyRecord, getAuthUserState, touchApiKeyLastUsed } from "@/lib/data/auth"
import { checkApiQuota, createRateLimitHeaders, type ApiQuotaType, type RateLimitResult } from "@/lib/api-rate-limit"
import { rateLimiters } from "@/lib/rate-limit"
import { ApiKeyService } from "@/lib/services/api-key"

/**
 * SafeUser contains only the fields needed by API consumers.
 * This prevents accidental exposure of sensitive user data.
 */
interface SafeUser {
    id: string
    stripeSubscriptionId: string | null
    stripePriceId: string | null
    stripeCurrentPeriodEnd: Date | null
}

interface ApiKeyValidationResult {
    user: SafeUser
    apiKeyId: string
    rateLimit: RateLimitResult
}

// Relaxed session rate limit result (no strict monthly tracking)
interface SessionRateLimitResult {
    success: boolean
    limit: number
    remaining: number
    reset: Date
}

/**
 * Validate an API key and check rate limits
 * Returns user and rate limit info, or null if invalid
 */
export async function validateApiKey(req: Request, quotaType?: ApiQuotaType): Promise<ApiKeyValidationResult | null> {
    const authHeader = req.headers.get("authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return null
    }

    const key = authHeader.split(" ")[1]

    // API keys start with "ak_"
    if (!key || !key.startsWith("ak_")) {
        return null
    }

    const keyHash = ApiKeyService.hashKey(key)

    const apiKey = await getAuthApiKeyRecord(keyHash)

    if (!apiKey) {
        return null
    }

    // Expired keys must not authenticate
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
        return null
    }

    // Banned users must not retain API access
    if (apiKey.user.banned) {
        return null
    }

    const rateLimit: RateLimitResult = quotaType
        ? await checkApiQuota(apiKey.user.id, apiKey.user, quotaType)
        : { success: true, limit: -1, remaining: -1, reset: new Date() }

    // Track last usage (fire-and-forget to avoid latency) after authentication,
    // even when the monthly quota rejects the request.
    touchApiKeyLastUsed(apiKey.id).catch(() => {})

    return {
        user: apiKey.user,
        apiKeyId: apiKey.id,
        rateLimit,
    }
}

/**
 * Check relaxed session rate limit (100 req/min - much more generous than API keys)
 * This provides basic abuse protection while maintaining good UX for browser sessions
 */
async function checkSessionRateLimit(userId: string): Promise<SessionRateLimitResult | null> {
    const limiter = rateLimiters.api
    if (!limiter) {
        return null // Rate limiting not configured
    }

    const result = await limiter.limit(userId)

    return {
        success: result.success,
        limit: result.limit,
        remaining: result.remaining,
        reset: new Date(result.reset),
    }
}

/**
 * Returns true when the caller explicitly attempted API key authentication
 * (i.e. the Authorization header starts with "Bearer ak_").
 * Used to distinguish "no credentials" from "wrong API key" so the server
 * can return 401 instead of silently falling back to the session cookie.
 */
export function hasExplicitApiKey(req: Request): boolean {
    const authHeader = req.headers.get("authorization")
    return !!authHeader && authHeader.startsWith("Bearer ak_")
}

/**
 * Validate request from either API key or session
 * Session-based requests have relaxed rate limiting (100/min) since Cloudflare handles DDoS
 */
export async function validateRequest(req: Request, quotaType?: ApiQuotaType) {
    // 1. Try API Key (with strict monthly rate limiting when quotaType is set)
    const apiKeyResult = await validateApiKey(req, quotaType)
    if (apiKeyResult) {
        return {
            user: apiKeyResult.user,
            rateLimit: apiKeyResult.rateLimit,
            rateLimitHeaders: createRateLimitHeaders(apiKeyResult.rateLimit),
        }
    }

    // If caller explicitly supplied an ak_ key but it was invalid, reject immediately.
    // Do not fall through to the session cookie — that would let a wrong/revoked key
    // silently authenticate as whoever owns the active browser session.
    if (hasExplicitApiKey(req)) {
        return null
    }

    // 2. Try Session (Cookies) - with relaxed rate limiting (100/min)
    const session = await auth()
    if (session?.user?.id) {
        // 2FA guard: session-based access requires 2FA verified if enabled
        if (session.user.twoFactorEnabled && !session.twoFactorVerified) {
            return null
        }

        const user = await getAuthUserState(session.user.id)

        // Banned users must not retain session access
        if (!user || user.banned) return null

        // Apply relaxed rate limiting for session users
        const sessionRateLimit = await checkSessionRateLimit(session.user.id)

        // If rate limited, return null user so downstream handlers reject the request
        if (sessionRateLimit && !sessionRateLimit.success) {
            return {
                user: null,
                rateLimit: sessionRateLimit,
                rateLimitHeaders: createSessionRateLimitHeaders(sessionRateLimit),
            }
        }

        return {
            user,
            rateLimit: sessionRateLimit,
            rateLimitHeaders: sessionRateLimit ? createSessionRateLimitHeaders(sessionRateLimit) : null,
        }
    }

    return null
}

/**
 * Create rate limit headers for session-based API responses
 */
function createSessionRateLimitHeaders(result: SessionRateLimitResult): Headers {
    const headers = new Headers()
    headers.set("X-RateLimit-Limit", result.limit.toString())
    headers.set("X-RateLimit-Remaining", Math.max(0, result.remaining).toString())
    headers.set("X-RateLimit-Reset", result.reset.getTime().toString())
    return headers
}

/**
 * Require an authenticated session with 2FA enforced.
 * Returns null if unauthenticated, 2FA-unverified, or banned.
 * Does not apply rate limiting — routes handle their own.
 */
export async function requireSession(): Promise<{ userId: string } | null> {
    const session = await auth()
    if (!session?.user?.id) return null
    if (session.user.twoFactorEnabled && !session.twoFactorVerified) return null

    const user = await getAuthUserState(session.user.id)
    if (!user || user.banned) return null

    return { userId: session.user.id }
}
