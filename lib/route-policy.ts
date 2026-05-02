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
import { createLogger } from "@/lib/logger"

const logger = createLogger("RoutePolicy")

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
    /** Rate limit headers to include in the response */
    rateLimitHeaders: Headers | null
}

type PolicyHandler<TRouteContext = void> = (ctx: PolicyContext, routeContext: TRouteContext) => Promise<Response>

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
            let userId: string | null = null
            let user: PolicyContext["user"] = null
            let apiKeyId: string | undefined
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
            } else if (policy.auth === "session") {
                const session = await auth()
                if (!session?.user?.id) {
                    return apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, requestId, 401)
                }
                if (require2FA && session.user.twoFactorEnabled && !session.twoFactorVerified) {
                    return apiError("Two-factor authentication required", ErrorCodes.UNAUTHORIZED, requestId, 401)
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
                                rateLimitHeaders,
                            }

                            if (policy.rateLimit) {
                                let identifier: string | null = null

                                if (typeof policy.rateLimitIdentifier === "string") {
                                    identifier = policy.rateLimitIdentifier
                                } else if (typeof policy.rateLimitIdentifier === "function") {
                                    identifier = await policy.rateLimitIdentifier(ctx, routeContext)
                                } else if (userId) {
                                    identifier = userId
                                }

                                if (identifier) {
                                    const rateLimited = await rateLimit(policy.rateLimit, identifier)
                                    if (rateLimited) return rateLimited
                                }
                            }

                            const response = await handler(ctx, routeContext)
                            return withApiHeaders(response, requestId, rateLimitHeaders)
                        }
                        return apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, requestId, 401)
                    }
                    if (require2FA && session.user.twoFactorEnabled && !session.twoFactorVerified) {
                        return apiError("Two-factor authentication required", ErrorCodes.UNAUTHORIZED, requestId, 401)
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
                }
            }
            // auth === "none": userId remains null

            // ── Ban checks ──────────────────────────────────────────────

            if (policy.checkBan && userId && policy.checkBan !== true) {
                const banState = await prisma.user.findUnique({
                    where: { id: userId },
                    select: { banFileUpload: true, banAliasCreation: true },
                })
                if (banState) {
                    if (policy.checkBan === "upload" && banState.banFileUpload) {
                        return apiError("File uploads are disabled for this account", ErrorCodes.FORBIDDEN, requestId, 403)
                    }
                    if (policy.checkBan === "alias" && banState.banAliasCreation) {
                        return apiError("Alias creation is disabled for this account", ErrorCodes.FORBIDDEN, requestId, 403)
                    }
                }
            }

            // ── Rate limiting ───────────────────────────────────────────

            if (policy.rateLimit) {
                let identifier: string | null = null

                if (typeof policy.rateLimitIdentifier === "string") {
                    identifier = policy.rateLimitIdentifier
                } else if (typeof policy.rateLimitIdentifier === "function") {
                    identifier = await policy.rateLimitIdentifier({
                        requestId,
                        request,
                        userId,
                        user,
                        apiKeyId,
                        rateLimitHeaders,
                    }, routeContext)
                } else if (userId) {
                    identifier = userId
                }

                if (identifier) {
                    const rateLimited = await rateLimit(policy.rateLimit, identifier)
                    if (rateLimited) return rateLimited
                }
            }

            // ── Execute handler ─────────────────────────────────────────

            const ctx: PolicyContext = {
                requestId,
                request,
                userId,
                user,
                apiKeyId,
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
