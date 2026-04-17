import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
import { ApiError, ForbiddenError, NotFoundError, RateLimitError, ValidationError } from "@/lib/api-error-utils"
import { checkApiQuota, type ApiQuotaType } from "@/lib/api-rate-limit"
import { getAuthUserState } from "@/lib/data/auth"
import { prisma } from "@/lib/prisma"
import { rateLimiters } from "@/lib/rate-limit"
import { createLogger } from "@/lib/logger"
import type { McpSession, McpUser } from "./types"

const logger = createLogger("MCP")

interface InvokeOptions {
    /** Monthly quota bucket to charge — mirrors `apiQuota` in route-policy. */
    quota?: ApiQuotaType
    /** Ban flag to check before invoking the handler. */
    checkBan?: "alias" | "upload"
    /** Per-user per-tool rate limit. */
    rateLimit?: keyof typeof rateLimiters
}

export async function invokeTool<T>(
    session: McpSession,
    opts: InvokeOptions,
    handler: (user: McpUser) => Promise<T>,
): Promise<T> {
    const userId = session.userId
    if (!userId) {
        throw new McpError(ErrorCode.InvalidRequest, "Token is missing a subject")
    }

    const user = await getAuthUserState(userId)
    if (!user) {
        throw new McpError(ErrorCode.InvalidRequest, "Account no longer active")
    }
    if (user.banned) {
        throw new McpError(-32001, "Account suspended", { code: "ACCOUNT_BANNED" })
    }

    if (opts.checkBan) {
        const ban = await prisma.user.findUnique({
            where: { id: userId },
            select: { banFileUpload: true, banAliasCreation: true },
        })
        if (ban) {
            if (opts.checkBan === "alias" && ban.banAliasCreation) {
                throw new McpError(-32001, "Alias creation is disabled for this account", {
                    code: "BAN_ALIAS_CREATION",
                })
            }
            if (opts.checkBan === "upload" && ban.banFileUpload) {
                throw new McpError(-32001, "File uploads are disabled for this account", {
                    code: "BAN_FILE_UPLOAD",
                })
            }
        }
    }

    if (opts.quota) {
        const quota = await checkApiQuota(userId, user, opts.quota)
        if (!quota.success) {
            throw new McpError(-32002, "Monthly API quota exceeded", {
                code: "QUOTA_EXCEEDED",
                quotaType: opts.quota,
                limit: quota.limit,
                remaining: Math.max(0, quota.remaining),
                resetAt: quota.reset.toISOString(),
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
                throw new McpError(-32003, "Rate limit exceeded", {
                    code: "RATE_LIMITED",
                    resetAt: new Date(result.reset).toISOString(),
                })
            }
        }
    }

    try {
        return await handler({
            id: userId,
            stripeSubscriptionId: user.stripeSubscriptionId,
            stripePriceId: user.stripePriceId,
            stripeCurrentPeriodEnd: user.stripeCurrentPeriodEnd,
        })
    } catch (error) {
        if (error instanceof McpError) throw error
        if (error instanceof NotFoundError) {
            throw new McpError(-32004, error.message, { code: error.code ?? "NOT_FOUND" })
        }
        if (error instanceof ValidationError) {
            throw new McpError(ErrorCode.InvalidParams, error.message, { code: error.code ?? "VALIDATION_ERROR" })
        }
        if (error instanceof ForbiddenError) {
            throw new McpError(-32001, error.message, { code: error.code ?? "FORBIDDEN" })
        }
        if (error instanceof RateLimitError) {
            throw new McpError(-32003, error.message, { code: error.code ?? "RATE_LIMITED" })
        }
        if (error instanceof ApiError) {
            throw new McpError(ErrorCode.InternalError, error.message, { code: error.code ?? "API_ERROR" })
        }
        logger.error("MCP tool handler threw unexpected error", error)
        throw new McpError(ErrorCode.InternalError, "Internal server error")
    }
}

/**
 * Render a handler result as an MCP tool result (stringified JSON in a text
 * block plus a mirrored `structuredContent` payload so clients that understand
 * the output schema get typed access).
 */
export function toolResult<T>(data: T) {
    return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
        structuredContent: data as Record<string, unknown>,
    }
}
