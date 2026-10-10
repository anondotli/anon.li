import { describe, expect, it } from "vitest"
import { isMcpAnalyticsProblem } from "@/lib/mcp/analytics-log"

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
