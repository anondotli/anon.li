import crypto from "crypto"
import { rateLimiters } from "@/lib/rate-limit"
import { createLogger } from "@/lib/logger"

const logger = createLogger("InternalApiAuth")

/**
 * Validates the internal API secret using timing-safe comparison.
 * Used by internal APIs called by the mail server.
 *
 * Security:
 * - Uses SHA-256 hashing to ensure constant-length comparison
 * - Uses crypto.timingSafeEqual to prevent timing attacks
 * - Returns false if secret is not configured or not provided
 */
export function validateInternalApiSecret(req: Request): boolean {
    const secret = process.env.MAIL_API_SECRET
    if (!secret) return false

    const providedToken = req.headers.get("x-api-secret")
    if (!providedToken) return false

    const secretHash = crypto.createHash("sha256").update(secret).digest()
    const providedHash = crypto.createHash("sha256").update(providedToken).digest()

    return crypto.timingSafeEqual(secretHash, providedHash)
}

/**
 * Rate limit internal API requests as defense-in-depth.
 * Returns true if rate limited (caller should return 429).
 */
export async function isInternalRateLimited(endpoint: string): Promise<boolean> {
    const limiter = rateLimiters.internal
    if (!limiter) return false

    try {
        const result = await limiter.limit(`internal:${endpoint}`)
        if (!result.success) {
            logger.warn("Internal API rate limited", { endpoint })
        }
        return !result.success
    } catch (error) {
        logger.error("Internal API rate limit check failed", error, { endpoint })
        return false
    }
}
