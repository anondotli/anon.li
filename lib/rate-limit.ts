import { Ratelimit, type Duration } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createLogger } from "@/lib/logger";

const logger = createLogger("RateLimit");

const isProduction = process.env.NODE_ENV === "production";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

function createLimiter(prefix: string, limit: number, window: Duration, analytics = false): Ratelimit {
  return new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(limit, window), prefix, analytics });
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
  formFree: createLimiter("api:form:monthly:free", 500, "30 d", false),
  formPlus: createLimiter("api:form:monthly:plus", 25000, "30 d", false),
  formPro: createLimiter("api:form:monthly:pro", 100000, "30 d", false),
};

// Rate limiters for different endpoints (per-request abuse prevention)
export const rateLimiters = {
  fileUpload: createLimiter("ratelimit:file:upload", 50, "1 h"),
  // Authenticated uploads create one file record per file, so normal multi-file
  // drops and retry-heavy sessions need a much higher budget than guests.
  fileUploadAuth: createLimiter("ratelimit:file:upload:auth", 500, "1 h"),
  aliasCreate: createLimiter("ratelimit:alias:create", 60, "1 h"),
  auth: createLimiter("ratelimit:auth", 10, "15 m"),
  // Credential sign-in brute-force guard. better-auth's built-in limiter is
  // disabled (we use Upstash) and the Turnstile captcha only covers magic-link,
  // so /sign-in/email would otherwise be an unthrottled password oracle. Keyed
  // by client IP and by submitted email (see hooks.before in lib/auth.ts).
  signIn: createLimiter("ratelimit:signin", 10, "15 m"),
  apiKey: createLimiter("ratelimit:apikey", 30, "1 h"),
  api: createLimiter("ratelimit:api", 100, "1 m"),
  download: createLimiter("ratelimit:download", 200, "1 h"),
  apiFileList: createLimiter("ratelimit:api:file:list", 60, "1 m"),
  apiFileUpload: createLimiter("ratelimit:api:file:upload", 30, "1 h"),
  apiFileDelete: createLimiter("ratelimit:api:file:delete", 60, "1 h"),
  chunkUpload: createLimiter("ratelimit:chunk:upload", 500, "1 m"),
  loginRegister: createLimiter("ratelimit:login:register", 10, "60 s"),
  twoFactorVerify: createLimiter("ratelimit:2fa:verify", 10, "15 m"),
  // Per-IP ceiling for the 2FA verify endpoints, applied in the global before
  // hook (lib/auth.ts). The pending-login limiter must NOT be keyed on the
  // pending-2FA cookie (attacker-rotatable → resets the bucket); IP is the
  // brute-force-relevant signal. Set generously so shared office/carrier IPs
  // aren't blocked, while a single-IP grind of a 6-digit TOTP stays infeasible.
  twoFactorVerifyIp: createLimiter("ratelimit:2fa:verify:ip", 30, "15 m"),
  reportAbuse: createLimiter("ratelimit:report:abuse", 5, "1 h"),
  reportAbusePerResource: createLimiter("ratelimit:report:abuse:resource", 10, "24 h"),
  // Public, unauthenticated report-status lookup (GET ?token=...). Throttle per
  // IP so the endpoint can't be hammered as a token-existence oracle.
  reportStatus: createLimiter("ratelimit:report:status", 30, "1 m"),
  domainCreate: createLimiter("ratelimit:domain:create", 10, "1 h"),
  recipientOps: createLimiter("ratelimit:recipient:ops", 60, "1 h"),
  emailResend: createLimiter("ratelimit:email:resend", 10, "1 h"),
  // Org invitations send email to arbitrary addresses with inviter-chosen
  // content — keyed by inviter user id so one account can't spam inboxes.
  orgInvite: createLimiter("ratelimit:org:invite", 20, "1 h"),
  orgCreate: createLimiter("ratelimit:org:create", 10, "1 h"),
  pgpOps: createLimiter("ratelimit:pgp:ops", 30, "1 h"),
  domainOps: createLimiter("ratelimit:domain:ops", 30, "1 h"),
  userExport: createLimiter("ratelimit:user:export", 5, "1 h"),
  dropList: createLimiter("ratelimit:drop:list", 60, "1 m"),
  dropOps: createLimiter("ratelimit:drop:ops", 100, "1 h"),
  // Upload retries create a fresh drop ID today, so the create budget needs to
  // tolerate flaky networks without forcing users to wait an hour.
  dropCreate: createLimiter("ratelimit:drop:create", 60, "1 h"),
  // Per-IP DAILY ceiling for anonymous (guest) drops, layered on top of the
  // hourly dropCreate burst limit — bounds anonymous bandwidth cost/abuse and
  // nudges heavy guests toward signing up. Authenticated users are exempt.
  dropCreateGuest: createLimiter("ratelimit:drop:create:guest", 10, "24 h"),
  // Aborting stale multipart uploads is cleanup, not user-visible abuse. Keep
  // this separate from dropOps so retries/cancels do not starve normal actions.
  dropAbortUpload: createLimiter("ratelimit:drop:abort-upload", 300, "1 h"),
  dropDownload: createLimiter("ratelimit:drop:download", 100, "1 h"),
  dropMetadata: createLimiter("ratelimit:drop:metadata", 120, "1 m"),
  dropMetadataPerDrop: createLimiter("ratelimit:drop:metadata:perdrop", 200, "1 h"),
  formCreate: createLimiter("ratelimit:form:create", 30, "1 h"),
  formOps: createLimiter("ratelimit:form:ops", 100, "1 h"),
  formList: createLimiter("ratelimit:form:list", 60, "1 m"),
  // Public form submission endpoint is strict per-IP; separate limiter for
  // authenticated submitters avoids punishing users with shared IPs (offices,
  // mobile carriers) when they submit forms.
  formSubmit: createLimiter("ratelimit:form:submit", 20, "1 h"),
  formSubmitAuth: createLimiter("ratelimit:form:submit:auth", 200, "1 h"),
  formSubmissionRead: createLimiter("ratelimit:form:submission:read", 300, "1 h"),
  stripeOps: createLimiter("ratelimit:stripe:ops", 10, "1 h"),
  profileUpdate: createLimiter("ratelimit:profile:update", 30, "1 h"),
  vaultBootstrap: createLimiter("ratelimit:vault:bootstrap", 5, "1 m"),
  vaultSetup: createLimiter("ratelimit:vault:setup", 5, "1 h"),
  vaultOps: createLimiter("ratelimit:vault:ops", 60, "1 h"),
  vaultDropKeysRead: createLimiter("ratelimit:vault:drop-keys:read", 300, "1 h"),
  vaultFormKeysRead: createLimiter("ratelimit:vault:form-keys:read", 300, "1 h"),
  passwordReset: createLimiter("ratelimit:password:reset", 5, "1 h"),
  passwordResetEmail: createLimiter("ratelimit:password:reset:email", 3, "1 h"),
  cspReport: createLimiter("ratelimit:csp:report", 20, "1 m"),
};

export type RateLimitKey = keyof typeof rateLimiters

/**
 * Auth-critical limiters that must FAIL CLOSED when Redis is unreachable.
 * For general traffic, failing open on a Redis outage is the right call (don't
 * self-DoS). But for sign-in, 2FA, sign-up, and password reset, failing open
 * removes the ONLY brute-force protection (better-auth's built-in limiter is
 * disabled), so a Redis outage would expose every account to unlimited guessing.
 * For these, an outage should deny rather than wave attackers through.
 */
const FAIL_CLOSED_LIMITERS: ReadonlySet<RateLimitKey> = new Set([
  "auth",
  "signIn",
  "loginRegister",
  "twoFactorVerify",
  "twoFactorVerifyIp",
  "passwordReset",
  "passwordResetEmail",
])

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
  limiter: Ratelimit,
  identifier: string,
  failClosed = false
): Promise<NextResponse | null> {
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
    logger.error("Rate limit check failed (Redis may be down)", { identifier, failClosed, error });

    // Auth-critical limiters fail closed: if we can't verify the limit, deny
    // rather than expose accounts to unlimited brute force during an outage.
    if (failClosed) {
      return NextResponse.json(
        {
          error: "Service temporarily unavailable",
          message: "We couldn't verify this request right now. Please try again shortly.",
        },
        { status: 503, headers: { "Retry-After": "30" } }
      );
    }

    // For everything else, allow the request: rejecting all traffic because
    // Redis is down would be a self-inflicted DoS.
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
  return checkRateLimit(limiter, id, FAIL_CLOSED_LIMITERS.has(type));
}
