import { Ratelimit, type Duration } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createLogger } from "@/lib/logger";

const logger = createLogger("RateLimit");

const isProduction = process.env.NODE_ENV === "production";

export const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  })
  : null;

// In production, rate limiting must be configured
if (isProduction && !redis) {
  throw new Error("Rate limiting is required in production. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.");
}

function createLimiter(prefix: string, limit: number, window: Duration, analytics = false): Ratelimit | null {
  return redis ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(limit, window), prefix, analytics }) : null;
}

// Monthly API quota limiters (tier-based)
// Used by api-rate-limit.ts for tracking monthly usage per subscription tier
// Values must match ALIAS_LIMITS in config/plans.ts
export const monthlyApiLimiters = {
  free: createLimiter("api:monthly:free", 500, "30 d", false),
  plus: createLimiter("api:monthly:plus", 25000, "30 d", false),
  pro: createLimiter("api:monthly:pro", 100000, "30 d", false),
  dropFree: createLimiter("api:drop:monthly:free", 500, "30 d", false),
  dropPlus: createLimiter("api:drop:monthly:plus", 25000, "30 d", false),
  dropPro: createLimiter("api:drop:monthly:pro", 100000, "30 d", false),
};

// Rate limiters for different endpoints (per-request abuse prevention)
export const rateLimiters = {
  fileUpload: createLimiter("ratelimit:file:upload", 50, "1 h"),
  fileUploadAuth: createLimiter("ratelimit:file:upload:auth", 100, "1 h"),
  aliasCreate: createLimiter("ratelimit:alias:create", 60, "1 h"),
  auth: createLimiter("ratelimit:auth", 10, "15 m"),
  apiKey: createLimiter("ratelimit:apikey", 30, "1 h"),
  api: createLimiter("ratelimit:api", 100, "1 m"),
  download: createLimiter("ratelimit:download", 200, "1 h"),
  apiFileList: createLimiter("ratelimit:api:file:list", 60, "1 m"),
  apiFileUpload: createLimiter("ratelimit:api:file:upload", 30, "1 h"),
  apiFileDelete: createLimiter("ratelimit:api:file:delete", 60, "1 h"),
  chunkUpload: createLimiter("ratelimit:chunk:upload", 500, "1 m"),
  loginRegister: createLimiter("ratelimit:login:register", 10, "60 s"),
  twoFactorVerify: createLimiter("ratelimit:2fa:verify", 10, "15 m"),
  reportAbuse: createLimiter("ratelimit:report:abuse", 5, "1 h"),
  reportAbusePerResource: createLimiter("ratelimit:report:abuse:resource", 10, "24 h"),
  domainCreate: createLimiter("ratelimit:domain:create", 10, "1 h"),
  recipientOps: createLimiter("ratelimit:recipient:ops", 60, "1 h"),
  emailResend: createLimiter("ratelimit:email:resend", 10, "1 h"),
  pgpOps: createLimiter("ratelimit:pgp:ops", 30, "1 h"),
  domainOps: createLimiter("ratelimit:domain:ops", 30, "1 h"),
  userExport: createLimiter("ratelimit:user:export", 5, "1 h"),
  dropList: createLimiter("ratelimit:drop:list", 60, "1 m"),
  dropOps: createLimiter("ratelimit:drop:ops", 100, "1 h"),
  dropCreate: createLimiter("ratelimit:drop:create", 20, "1 h"),
  dropDownload: createLimiter("ratelimit:drop:download", 100, "1 h"),
  dropMetadata: createLimiter("ratelimit:drop:metadata", 120, "1 m"),
  dropMetadataPerDrop: createLimiter("ratelimit:drop:metadata:perdrop", 200, "1 h"),
  stripeOps: createLimiter("ratelimit:stripe:ops", 10, "1 h"),
  profileUpdate: createLimiter("ratelimit:profile:update", 30, "1 h"),
  internal: createLimiter("ratelimit:internal", 1000, "1 m"),
};

/**
 * Get client IP address from request headers.
 * Trust chain: Cloudflare > Vercel > fallback to "unknown".
 * x-forwarded-for and x-real-ip are NOT trusted as they are client-controllable
 * when requests bypass Cloudflare/Vercel (direct-to-origin).
 */
export async function getClientIp(): Promise<string> {
  const headersList = await headers();

  // 1. Cloudflare (highest priority, injected by edge)
  const cfConnectingIp = headersList.get("cf-connecting-ip");
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  // 2. Vercel (trusted edge proxy)
  const vercelForwardedFor = headersList.get("x-vercel-forwarded-for");
  if (vercelForwardedFor) {
    return vercelForwardedFor;
  }

  // 3. No trusted proxy header found — in production this indicates a bypass attempt.
  // Fail closed: do not fall back to x-real-ip as it is client-controllable
  // when requests bypass the CDN/reverse proxy.
  if (isProduction) {
    throw new Error("Cannot determine client IP address");
  }

  // In development, fall back to localhost
  return "127.0.0.1";
}

/**
 * Check rate limit for a given limiter and identifier
 * Returns null if rate limit passed, or a NextResponse if rate limited
 */
export async function checkRateLimit(
  limiter: Ratelimit | null,
  identifier: string
): Promise<NextResponse | null> {
  // If rate limiting is not configured, allow request
  if (!limiter) {
    return null;
  }

  try {
    const { success, limit, reset } = await limiter.limit(identifier);

    if (!success) {
      return NextResponse.json(
        {
          error: "Too many requests",
          message: "Rate limit exceeded. Please try again later.",
          retryAfter: Math.ceil((reset - Date.now()) / 1000),
        },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": limit.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": reset.toString(),
            "Retry-After": Math.ceil((reset - Date.now()) / 1000).toString(),
          },
        }
      );
    }

    return null;
  } catch (error) {
    // If Redis is unreachable, allow the request but log the failure.
    // Rejecting all traffic because Redis is down would be a self-inflicted DoS.
    logger.error("Rate limit check failed (Redis may be down)", { identifier, error });
    return null;
  }
}

/**
 * Rate limit middleware helper for API routes
 * Usage: const rateLimited = await rateLimit("fileUpload", userId || ip); if (rateLimited) return rateLimited;
 */
export async function rateLimit(
  type: keyof typeof rateLimiters,
  identifier?: string
): Promise<NextResponse | null> {
  const limiter = rateLimiters[type];
  const id = identifier || (await getClientIp());
  return checkRateLimit(limiter, id);
}
