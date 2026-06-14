import { auth } from "@/auth"
import { getAuthApiKeyRecord, getAuthUserState, touchApiKeyLastUsed } from "@/lib/data/auth"
import { checkApiQuota, type ApiQuotaType, type RateLimitResult } from "@/lib/api-rate-limit"
import { ApiKeyService } from "@/lib/services/api-key"
import type { SubscriptionLike, UserSub } from "@/lib/limits"

/**
 * SafeUser contains only the fields needed by API consumers.
 * This prevents accidental exposure of sensitive user data.
 */
interface SafeUser {
    id: string
    subscriptions: SubscriptionLike[]
}

interface ApiKeyValidationResult {
    user: SafeUser
    apiKeyId: string
    rateLimit: RateLimitResult
    /** Set when the key is org-owned — lets routes resolve org scope (Track G). */
    organizationId: string | null
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

    // Org-owned keys pool their monthly quota by org and resolve tier from the
    // org's subscriptions; personal keys meter per user (unchanged behavior).
    const quotaSubjectId = apiKey.organizationId ?? apiKey.user.id
    const quotaSubject: UserSub = apiKey.organizationId
        ? { subscriptions: apiKey.organizationSubscriptions, referralPlusUntil: null }
        : apiKey.user

    const rateLimit: RateLimitResult = quotaType
        ? await checkApiQuota(quotaSubjectId, quotaSubject, quotaType)
        : { success: true, limit: -1, remaining: -1, reset: new Date() }

    // Track last usage (fire-and-forget to avoid latency) after authentication,
    // even when the monthly quota rejects the request.
    touchApiKeyLastUsed(apiKey.id).catch(() => {})

    return {
        user: apiKey.user,
        apiKeyId: apiKey.id,
        rateLimit,
        organizationId: apiKey.organizationId,
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
