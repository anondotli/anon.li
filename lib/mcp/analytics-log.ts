import "server-only"
import { createLogger, sanitizeObject } from "@/lib/logger"

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

/**
 * Last stop before an @posthog/mcp event leaves: drop captured tool
 * arguments/results (`$mcp_parameters`, `$mcp_response` — they hold alias
 * addresses and recipient emails), then apply the logger's redaction, since
 * SDK events bypass captureServerEvent's sanitization.
 */
export function scrubMcpAnalyticsEvent<E extends { properties?: Record<string, unknown> }>(event: E): E {
    const properties: Record<string, unknown> = { ...event.properties }
    delete properties.$mcp_parameters
    delete properties.$mcp_response
    // `$session_id` is PostHog's random grouping id, not a credential; the
    // generic /session/ redaction rule would otherwise break session grouping.
    const sessionId = properties.$session_id
    const sanitized = sanitizeObject(properties) as Record<string, unknown>
    if (typeof sessionId === "string") sanitized.$session_id = sessionId
    event.properties = sanitized
    return event
}
