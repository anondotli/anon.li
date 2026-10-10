import { describe, expect, it } from "vitest"
import { isMcpAnalyticsProblem, scrubMcpAnalyticsEvent } from "@/lib/mcp/analytics-log"

describe("isMcpAnalyticsProblem", () => {
    it.each([
        "Successfully set up listener for new tool registrations",
        "Identified session ses_01a12559-9c44-73a6-8fed-15837eb9b446",
        "Captured PostHog event evt_1 | posthog:identify | 1 ms | identified",
        "Captured PostHog event evt_2 | mcp:initialize | 5 ms | anonymous",
        "Tool list_aliases callback already wrapped, skipping re-wrap",
        "instrument() - Server already instrumented, skipping initialization",
    ])("treats routine message as debug: %s", (message) => {
        expect(isMcpAnalyticsProblem(message)).toBe(false)
    })

    it.each([
        "Warning: Failed to instrument server - boom",
        "WARN: Tool \"x\" has complex schema (oneOf/allOf/anyOf/$ref). Skipping injection.",
        "Error: User supplied identify function threw an error while identifying session s",
        "eventProperties callback error: boom",
        "intentFallback callback error: boom",
        "PostHog MCP analytics SDK Compatibility: This version only supports Model Context Protocol TypeScript SDK v1.11 and above.",
    ])("treats problem message as warn: %s", (message) => {
        expect(isMcpAnalyticsProblem(message)).toBe(true)
    })
})

describe("scrubMcpAnalyticsEvent", () => {
    it("drops captured tool arguments/results and keeps the client id readable", () => {
        const event = scrubMcpAnalyticsEvent({
            event: "$mcp_tool_call",
            distinct_id: "user-1",
            properties: {
                $mcp_tool_name: "add_recipient",
                $mcp_parameters: { email: "someone@example.com" },
                $mcp_response: { email: "someone@example.com", id: "rcpt-1" },
                mcp_client: "client-1",
                oauth_client_id: "client-1",
            },
        })
        expect(event.properties).not.toHaveProperty("$mcp_parameters")
        expect(event.properties).not.toHaveProperty("$mcp_response")
        expect(JSON.stringify(event)).not.toContain("someone@example.com")
        expect(event.properties.$mcp_tool_name).toBe("add_recipient")
        // `mcp_client` survives the logger's /auth/ key redaction.
        expect(event.properties.mcp_client).toBe("client-1")
        expect(event.properties.oauth_client_id).toBe("[REDACTED]")
    })

    it("keeps PostHog's session grouping id while redacting other session keys", () => {
        const event = scrubMcpAnalyticsEvent({
            event: "$mcp_tool_call",
            properties: { $session_id: "019a-session", session_token: "secret-value" },
        })
        expect(event.properties.$session_id).toBe("019a-session")
        expect(event.properties.session_token).toBe("[REDACTED]")
    })
})
