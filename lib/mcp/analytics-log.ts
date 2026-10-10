import "server-only"
import { createLogger } from "@/lib/logger"

const logger = createLogger("McpAnalytics")

/**
 * @posthog/mcp reports everything — failures and routine chatter like
 * "Identified session …" or "Captured PostHog event …" — through one string
 * sink. Its problems are prefixed ("Warning:", "WARN:", "Error:") or mention
 * an error/failure; route those to warn and everything else to debug so a
 * healthy MCP request doesn't emit a burst of WARN lines.
 */
const PROBLEM_PATTERN = /^(warn(ing)?|error)\b|\b(errors?|fail(ed|ure)?|threw)\b|compatibility/i

export function isMcpAnalyticsProblem(message: string): boolean {
    return PROBLEM_PATTERN.test(message)
}

export function logMcpAnalytics(message: string): void {
    if (isMcpAnalyticsProblem(message)) logger.warn(message)
    else logger.debug(message)
}
