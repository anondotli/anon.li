/**
 * @vitest-environment node
 */
import { describe, it, expect, vi } from "vitest"
import type { Ratelimit } from "@upstash/ratelimit"
import { checkRateLimit } from "@/lib/rate-limit"

// A limiter whose backing store (Upstash/Redis) is unreachable.
function throwingLimiter(): Ratelimit {
    return {
        limit: vi.fn().mockRejectedValue(new Error("Redis unreachable")),
    } as unknown as Ratelimit
}

describe("checkRateLimit behavior on Redis outage", () => {
    it("fails OPEN (allows the request) for non-critical limiters", async () => {
        const result = await checkRateLimit(throwingLimiter(), "ip:1.2.3.4", false)
        expect(result).toBeNull()
    })

    it("defaults to fail-open when failClosed is not specified", async () => {
        const result = await checkRateLimit(throwingLimiter(), "ip:1.2.3.4")
        expect(result).toBeNull()
    })

    it("fails CLOSED (503) for auth-critical limiters", async () => {
        const result = await checkRateLimit(throwingLimiter(), "email:victim@example.com", true)
        expect(result).not.toBeNull()
        expect(result!.status).toBe(503)
    })
})
