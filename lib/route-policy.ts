/**
 * Declarative Route Policy Layer
 *
 * Replaces ad-hoc auth boilerplate across API routes with a single composable
 * middleware. Each route declares its trust model in one line.
 *
 * Policy matrix for app/api/v1:
 * - Alias routes: auth `api_key`, `apiQuota: "alias"`, `checkBan: "alias"` on create.
 * - Drop routes: auth `api_key_or_session` or `none`, `apiQuota: "drop"` where the route
 *   consumes drop API quota, `checkBan: "upload"` on create/upload actions.
 * - Recipient, domain, api-key, me, checkout: no monthly `apiQuota`; use explicit
 *   per-route limiter keys (`recipientOps`, `domainCreate`, `domainOps`, `apiKey`,
 *   `emailResend`, `pgpOps`, `api`, `stripeOps`).
 * - All POST/PATCH/PUT/DELETE handlers declare `requireCsrf: true`; CSRF is enforced
 *   only for session-authenticated requests and skipped for API-key callers.
 *
 * Usage:
 *   export const GET = withPolicy({ auth: "api_key_or_session" }, async (ctx) => {
 *       // ctx.userId is guaranteed non-null
 *       // ctx.requestId is set
 *       return apiSuccess(data, ctx.requestId)
 *   })
 */

import { auth } from "@/auth"
import { validateApiKey, hasExplicitApiKey } from "@/lib/api-auth"
import { createRateLimitHeaders, type ApiQuotaType } from "@/lib/api-rate-limit"
import { getAuthUserState } from "@/lib/data/auth"
import { evaluateBan } from "@/lib/data/user-bans"
import { prisma } from "@/lib/prisma"
import { rateLimiters, rateLimit } from "@/lib/rate-limit"
import { validateCsrf } from "@/lib/csrf"
import type { SubscriptionLike } from "@/lib/limits"
import {
    generateRequestId,
    apiError,
    apiRateLimitError,
    apiErrorFromUnknown,
    withApiHeaders,
    ErrorCodes,
} from "@/lib/api-response"
import { ForbiddenError } from "@/lib/api-error-utils"
import { meetsMinRole, orgScope, personalScope, type OrgRole, type OwnerScope } from "@/lib/ownership"
import { requiresTwoFactorChallenge, orgRequiresTwoFactorSetup } from "@/lib/access-policy"
import { createLogger } from "@/lib/logger"

const logger = createLogger("RoutePolicy")

// Org-owned API keys act on their org's resources at LEAST privilege: they get
// org scope (so reads/writes are org-scoped) with the "member" role — enough for
// resource CRUD (ownerWhere is role-agnostic) but unable to satisfy any
// minRole-gated org operation. Broaden later via an explicit per-key scope.
const ORG_API_KEY_ROLE: OrgRole = "member"

// ─── Policy definition ─────────────────────────────────────────────────────

interface RoutePolicy {
    /** Authentication mode */
    auth: "api_key" | "session" | "api_key_or_session" | "optional_api_key_or_session" | "none"
    /** Require 2FA verification for session-based auth (default: true) */
    require2FA?: boolean
    /** Require CSRF validation for session-based mutations (default: false) */
    requireCsrf?: boolean
    /** Rate limit key (applied after auth) */
    rateLimit?: keyof typeof rateLimiters
    /** Override the identifier used for route-level rate limiting */
    rateLimitIdentifier?: string | ((ctx: PolicyContext, routeContext?: unknown) => string | null | Promise<string | null>)
    /** Check ban flags (true = general, "upload" = banFileUpload, "alias" = banAliasCreation) */
    checkBan?: boolean | "upload" | "alias"
    /** Monthly API quota bucket consumed by API-key requests only */
    apiQuota?: ApiQuotaType
    /** Require/allow active organization context (session auth). "required" rejects personal-context calls. */
    organization?: "required" | "optional"
    /** Minimum org role required (implies organization: "required"). */
    minOrgRole?: OrgRole
}

// ─── Request context passed to handlers ─────────────────────────────────────

interface PolicyContext {
    requestId: string
    request: Request
    /** Authenticated user ID. Null only when policy.auth is "none". */
    userId: string | null
    /** User data from DB (available when authenticated) */
    user: {
        id: string
        subscriptions: SubscriptionLike[]
    } | null
    /** API key ID if authenticated via API key */
    apiKeyId?: string
    /** Active organization id — from the session's active org, or an org-owned API key. */
    organizationId: string | null
    /** Acting user's role in the active org, or null. */
    orgRole: OrgRole | null
    /** Rate limit headers to include in the response */
    rateLimitHeaders: Headers | null
}

type PolicyHandler<TRouteContext = void> = (ctx: PolicyContext, routeContext: TRouteContext) => Promise<Response>

async function resolveRateLimitIdentifier<TRouteContext>(
    policy: RoutePolicy,
    ctx: PolicyContext,
    routeContext: TRouteContext,
): Promise<string | null> {
    if (typeof policy.rateLimitIdentifier === "string") {
        return policy.rateLimitIdentifier
    }
    if (typeof policy.rateLimitIdentifier === "function") {
        return policy.rateLimitIdentifier(ctx, routeContext)
    }
    return ctx.userId
}

async function applyPolicyRateLimit<TRouteContext>(
    policy: RoutePolicy,
    ctx: PolicyContext,
    routeContext: TRouteContext,
): Promise<Response | null> {
    if (!policy.rateLimit) return null

    const identifier = await resolveRateLimitIdentifier(policy, ctx, routeContext)
    if (!identifier) return null

    return rateLimit(policy.rateLimit, identifier)
}

// ─── Main middleware ────────────────────────────────────────────────────────

/**
 * Wrap a route handler with declarative policy enforcement.
 * Returns a standard Next.js route handler function.
 */
export function withPolicy(policy: RoutePolicy, handler: PolicyHandler<void>): (request: Request) => Promise<Response>
export function withPolicy<TRouteContext>(policy: RoutePolicy, handler: PolicyHandler<TRouteContext>): (request: Request, routeContext: TRouteContext) => Promise<Response>
export function withPolicy<TRouteContext = void>(policy: RoutePolicy, handler: PolicyHandler<TRouteContext>) {
    return async (request: Request, routeContext: TRouteContext): Promise<Response> => {
        const requestId = generateRequestId()
        const require2FA = policy.require2FA ?? true

        try {
            // Defense-in-depth: an API-key-capable route with neither a monthly
            // apiQuota nor a per-request rateLimit would be unthrottled. Today every
            // such route sets one or both; warn loudly on any future regression
            // instead of silently shipping unmetered API access.
            if (
                (policy.auth === "api_key" || policy.auth === "api_key_or_session" || policy.auth === "optional_api_key_or_session") &&
                !policy.apiQuota &&
                !policy.rateLimit
            ) {
                logger.warn("API-key route has neither apiQuota nor rateLimit; request is unthrottled", {
                    path: new URL(request.url).pathname,
                })
            }

            let userId: string | null = null
            let user: PolicyContext["user"] = null
            let apiKeyId: string | undefined
            let organizationId: string | null = null
            let orgRole: OrgRole | null = null
            let rateLimitHeaders: Headers | null = null

            // ── Authentication ──────────────────────────────────────────

            if (policy.auth === "api_key") {
                const result = await validateApiKey(request, policy.apiQuota)
                if (!result) {
                    return apiError("Unauthorized - API key required", ErrorCodes.UNAUTHORIZED, requestId, 401)
                }
                if (!result.rateLimit.success) {
                    return withApiHeaders(
                        apiRateLimitError(requestId, result.rateLimit.reset, true),
                        requestId,
                        createRateLimitHeaders(result.rateLimit),
                    )
                }
                userId = result.user.id
                user = result.user
                apiKeyId = result.apiKeyId
                rateLimitHeaders = createRateLimitHeaders(result.rateLimit)
                if (result.organizationId) {
                    organizationId = result.organizationId
                    orgRole = ORG_API_KEY_ROLE
                }
            } else if (policy.auth === "session") {
                const session = await auth()
                if (!session?.user?.id) {
                    return apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, requestId, 401)
                }
                if (require2FA && requiresTwoFactorChallenge(session)) {
                    return apiError("Two-factor authentication required", ErrorCodes.UNAUTHORIZED, requestId, 401)
                }
                if (orgRequiresTwoFactorSetup(session)) {
                    return apiError("Your team requires two-factor authentication. Enable it in your security settings.", ErrorCodes.FORBIDDEN, requestId, 403)
                }
                if (policy.requireCsrf) {
                    validateCsrf(request)
                }
                const dbUser = await getAuthUserState(session.user.id)
                if (!dbUser || dbUser.banned) {
                    return apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, requestId, 401)
                }
                userId = session.user.id
                user = dbUser
                organizationId = session.activeOrganizationId
                orgRole = session.activeOrgRole
            } else if (policy.auth === "api_key_or_session" || policy.auth === "optional_api_key_or_session") {
                // Try API key first
                const apiKeyResult = await validateApiKey(request, policy.apiQuota)
                if (apiKeyResult) {
                    if (!apiKeyResult.rateLimit.success) {
                        return withApiHeaders(
                            apiRateLimitError(requestId, apiKeyResult.rateLimit.reset, true),
                            requestId,
                            createRateLimitHeaders(apiKeyResult.rateLimit),
                        )
                    }
                    userId = apiKeyResult.user.id
                    user = apiKeyResult.user
                    apiKeyId = apiKeyResult.apiKeyId
                    rateLimitHeaders = createRateLimitHeaders(apiKeyResult.rateLimit)
                    if (apiKeyResult.organizationId) {
                        organizationId = apiKeyResult.organizationId
                        orgRole = ORG_API_KEY_ROLE
                    }
                } else if (hasExplicitApiKey(request)) {
                    return apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, requestId, 401)
                } else {
                    // Fall back to session
                    const session = await auth()
                    if (!session?.user?.id) {
                        if (policy.auth === "optional_api_key_or_session") {
                            const ctx: PolicyContext = {
                                requestId,
                                request,
                                userId,
                                user,
                                apiKeyId,
                                organizationId,
                                orgRole,
                                rateLimitHeaders,
                            }

                            const rateLimited = await applyPolicyRateLimit(policy, ctx, routeContext)
                            if (rateLimited) return rateLimited

                            const response = await handler(ctx, routeContext)
                            return withApiHeaders(response, requestId, rateLimitHeaders)
                        }
                        return apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, requestId, 401)
                    }
                    if (require2FA && requiresTwoFactorChallenge(session)) {
                        return apiError("Two-factor authentication required", ErrorCodes.UNAUTHORIZED, requestId, 401)
                    }
                    if (orgRequiresTwoFactorSetup(session)) {
                        return apiError("Your team requires two-factor authentication. Enable it in your security settings.", ErrorCodes.FORBIDDEN, requestId, 403)
                    }
                    if (policy.requireCsrf) {
                        validateCsrf(request)
                    }
                    const dbUser = await getAuthUserState(session.user.id)
                    if (!dbUser || dbUser.banned) {
                        return apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, requestId, 401)
                    }
                    userId = session.user.id
                    user = dbUser
                    organizationId = session.activeOrganizationId
                    orgRole = session.activeOrgRole
                }
            }
            // auth === "none": userId remains null

            // ── Organization context enforcement ────────────────────────

            if (policy.organization === "required" && !organizationId) {
                return apiError("No active organization", ErrorCodes.FORBIDDEN, requestId, 403)
            }
            if (policy.minOrgRole && !meetsMinRole(orgRole, policy.minOrgRole)) {
                return apiError("Insufficient organization role", ErrorCodes.FORBIDDEN, requestId, 403)
            }

            // ── Ban checks ──────────────────────────────────────────────

            if (policy.checkBan && userId && policy.checkBan !== true) {
                const banState = await prisma.user.findUnique({
                    where: { id: userId },
                    select: { banFileUpload: true, banAliasCreation: true },
                })
                if (banState) {
                    const ban = evaluateBan(banState, policy.checkBan)
                    if (ban) {
                        return apiError(ban.reason, ErrorCodes.FORBIDDEN, requestId, 403)
                    }
                }
            }

            // ── Rate limiting ───────────────────────────────────────────

            const rateLimited = await applyPolicyRateLimit(policy, {
                requestId,
                request,
                userId,
                user,
                apiKeyId,
                organizationId,
                orgRole,
                rateLimitHeaders,
            }, routeContext)
            if (rateLimited) {
                return rateLimited
            }

            // ── Execute handler ─────────────────────────────────────────

            const ctx: PolicyContext = {
                requestId,
                request,
                userId,
                user,
                apiKeyId,
                organizationId,
                orgRole,
                rateLimitHeaders,
            }

            const response = await handler(ctx, routeContext)
            return withApiHeaders(response, requestId, rateLimitHeaders)
        } catch (error) {
            if (error instanceof ForbiddenError) {
                return apiError(error.message, ErrorCodes.FORBIDDEN, requestId, 403)
            }
            logger.error("Route handler error", error)
            return apiErrorFromUnknown(error, requestId)
        }
    }
}

/**
 * Build an OwnerScope from a resolved PolicyContext, for use inside route
 * handlers (after confirming ctx.userId is non-null). Org context comes from
 * either the session's active org or an org-owned API key; else personal scope.
 */
export function scopeFromContext(ctx: PolicyContext): OwnerScope {
    if (!ctx.userId) {
        throw new ForbiddenError("Authentication required")
    }
    return ctx.organizationId && ctx.orgRole
        ? orgScope(ctx.userId, ctx.organizationId, ctx.orgRole)
        : personalScope(ctx.userId)
}
