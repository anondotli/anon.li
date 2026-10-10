import { ProtocolError } from "@modelcontextprotocol/server"
import { ApiError, ForbiddenError, NotFoundError, RateLimitError, ServiceUnavailableError, UpgradeRequiredError, ValidationError } from "@/lib/api-error-utils"
import { checkApiQuota, type ApiQuotaType } from "@/lib/api-rate-limit"
import { getAuthUserState } from "@/lib/data/auth"
import { evaluateBan } from "@/lib/data/user-bans"
import { prisma } from "@/lib/prisma"
import { rateLimiters } from "@/lib/rate-limit"
import { createLogger } from "@/lib/logger"
import type { McpSession, McpUser } from "./types"

const logger = createLogger("MCP")

/** OAuth scopes that gate the MCP tools (the `offline_access` scope is not a gate). */
type McpToolScope = "anon.li:aliases" | "anon.li:drops" | "anon.li:forms"

interface InvokeOptions {
    /**
     * OAuth scope the bearer token must carry to call this tool. Enforced
     * fail-closed: a token that lacks the scope is rejected before any work,
     * even though it authenticated successfully. Tokens issued via the consent
     * flow always carry a space-separated scope string.
     */
    scope?: McpToolScope
    /** Monthly quota bucket to charge — mirrors `apiQuota` in route-policy. */
    quota?: ApiQuotaType
    /** Ban flag to check before invoking the handler. */
    checkBan?: "alias" | "upload"
    /** Per-user per-tool rate limit. */
    rateLimit?: keyof typeof rateLimiters
}

/** Machine-readable error payload attached to every failed tool call. */
export interface McpToolErrorDetails {
    code: string
    message: string
    [key: string]: unknown
}

/**
 * A failed tool call, as an MCP tool *result* rather than a JSON-RPC protocol
 * error. The spec is explicit that errors originating from a tool belong in the
 * result with `isError: true`, and the SDK flattens any thrown `ProtocolError` into
 * `createToolError(message)` — its `data` payload never reaches the client.
 *
 * Building the result here keeps the structured details, in two places a client
 * can actually read them:
 *   - `_meta["anon.li/error"]` for clients that branch on machine-readable data
 *   - the text block, which is the only thing many agent loops show the model
 *
 * The `code` mirrors the REST API's error codes, so a client that speaks both
 * (the CLI, the plugin skills) applies one error table.
 */
export function toolError(details: McpToolErrorDetails) {
    const extras: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(details)) {
        if (key === "code" || key === "message" || value === undefined) continue
        extras[key] = value
    }
    const hasExtras = Object.keys(extras).length > 0
    const text = hasExtras
        ? `${details.message}\n\n${JSON.stringify({ code: details.code, ...extras }, null, 2)}`
        : details.message

    return {
        content: [{ type: "text" as const, text }],
        isError: true,
        _meta: {
            "anon.li/error": { code: details.code, message: details.message, ...extras },
        },
    }
}

/**
 * Run a tool handler behind the shared auth / ban / scope / quota / rate-limit
 * gate, and normalize every failure into a structured tool result.
 *
 * Returns either the handler's result or an `isError` result — never a business
 * error exception — so `outputSchema` validation is skipped by the SDK (it only
 * validates successful results) and clients get one consistent error surface.
 */
export async function invokeTool<T>(
    session: McpSession,
    opts: InvokeOptions,
    handler: (user: McpUser) => Promise<T>,
): Promise<T | ReturnType<typeof toolError>> {
    const userId = session.userId
    if (!userId) {
        return toolError({ code: "INVALID_TOKEN", message: "Token is missing a subject" })
    }

    const user = await getAuthUserState(userId)
    if (!user) {
        return toolError({ code: "ACCOUNT_NOT_ACTIVE", message: "Account no longer active" })
    }
    const accountBan = evaluateBan(user)
    if (accountBan) {
        return toolError({ code: accountBan.code, message: accountBan.reason })
    }

    if (opts.checkBan) {
        const banFlags = await prisma.user.findUnique({
            where: { id: userId },
            select: { banFileUpload: true, banAliasCreation: true },
        })
        const scopeBan = banFlags && evaluateBan(banFlags, opts.checkBan)
        if (scopeBan) {
            return toolError({ code: scopeBan.code, message: scopeBan.reason })
        }
    }

    if (opts.scope) {
        const grantedScopes = new Set((session.scopes ?? "").split(/\s+/).filter(Boolean))
        if (!grantedScopes.has(opts.scope)) {
            return toolError({
                code: "INSUFFICIENT_SCOPE",
                message: `Token is missing the '${opts.scope}' scope. Reconnect the connector and approve this scope.`,
                required_scope: opts.scope,
                granted_scopes: Array.from(grantedScopes),
            })
        }
    }

    if (opts.quota) {
        const quota = await checkApiQuota(userId, user, opts.quota)
        if (!quota.success) {
            return toolError({
                code: "QUOTA_EXCEEDED",
                message: "Monthly API quota exceeded",
                quota_type: opts.quota,
                limit: quota.limit,
                remaining: Math.max(0, quota.remaining),
                reset_at: quota.reset.toISOString(),
            })
        }
    }

    if (opts.rateLimit) {
        const limiter = rateLimiters[opts.rateLimit]
        if (limiter) {
            const result = await limiter.limit(userId).catch((error) => {
                // Never fail-closed on Redis outages — matches rate-limit.ts.
                logger.error("Rate limit check failed (Redis may be down)", { error })
                return null
            })
            if (result && !result.success) {
                return toolError({
                    code: "RATE_LIMITED",
                    message: "Rate limit exceeded — retry later",
                    reset_at: new Date(result.reset).toISOString(),
                })
            }
        }
    }

    try {
        return await handler({
            id: userId,
            subscriptions: user.subscriptions,
        })
    } catch (error) {
        if (error instanceof ProtocolError) throw error
        if (error instanceof UpgradeRequiredError) {
            return toolError({
                code: error.code ?? "UPGRADE_REQUIRED",
                message: error.message,
                upgrade: error.details,
            })
        }
        if (error instanceof NotFoundError) {
            return toolError({ code: error.code ?? "NOT_FOUND", message: error.message })
        }
        if (error instanceof ValidationError) {
            return toolError({ code: error.code ?? "VALIDATION_ERROR", message: error.message })
        }
        if (error instanceof ForbiddenError) {
            return toolError({ code: error.code ?? "FORBIDDEN", message: error.message })
        }
        if (error instanceof RateLimitError) {
            return toolError({ code: error.code ?? "RATE_LIMITED", message: error.message })
        }
        if (error instanceof ServiceUnavailableError) {
            return toolError({ code: error.code ?? "SERVICE_UNAVAILABLE", message: error.message })
        }
        if (error instanceof ApiError) {
            return toolError({ code: error.code ?? "API_ERROR", message: error.message })
        }
        logger.error("MCP tool handler threw unexpected error", error)
        return toolError({
            code: "INTERNAL_ERROR",
            message: "Internal server error. The request was not retried — check the tool's effect before repeating it.",
        })
    }
}

/**
 * Render a handler result as an MCP tool result: stringified JSON in a text
 * block plus a mirrored `structuredContent` payload. Each tool declares an
 * `outputSchema`, so SDK-aware clients validate `structuredContent` against it
 * and get typed access; text-only clients still get the readable JSON.
 *
 * `structuredContent` must contain *exactly* the fields the tool's
 * `outputSchema` declares: the SDK compiles that schema (with
 * `additionalProperties: false`) into a validator on the client, and any extra
 * key makes the whole call fail with -32602 before the agent sees the data.
 * Handlers therefore project explicit field lists instead of spreading a
 * shared API formatter.
 */
export function toolResult<T>(data: T) {
    return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
        structuredContent: data as Record<string, unknown>,
    }
}
