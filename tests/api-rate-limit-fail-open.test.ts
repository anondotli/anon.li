/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest"

const { limit, getRemaining } = vi.hoisted(() => ({ limit: vi.fn(), getRemaining: vi.fn() }))

vi.mock("@/lib/rate-limit", () => {
    const limiter = { limit, getRemaining }
    return {
        monthlyApiLimiters: {
            free: limiter, plus: limiter, pro: limiter,
            dropFree: limiter, dropPlus: limiter, dropPro: limiter,
            formFree: limiter, formPlus: limiter, formPro: limiter,
        },
    }
})

import { checkApiQuota, readApiRateLimit } from "@/lib/api-rate-limit"

const freeUser = { subscriptions: [], referralPlusUntil: null }

beforeEach(() => {
    vi.clearAllMocks()
})

describe("monthly API quota — Redis outage", () => {
    it("fails open (unmetered) when the quota check throws", async () => {
        limit.mockRejectedValue(new Error("upstash unreachable"))

        const result = await checkApiQuota("user-1", freeUser, "alias")

        expect(result).toMatchObject({ success: true, limit: -1, remaining: -1 })
    })

    it("fails open when the quota read throws", async () => {
        getRemaining.mockRejectedValue(new Error("upstash unreachable"))

        const result = await readApiRateLimit("user-1", freeUser)

        expect(result).toMatchObject({ success: true, limit: -1, remaining: -1 })
    })

    it("still enforces the quota when Redis answers", async () => {
        limit.mockResolvedValue({ success: false, limit: 500, remaining: 0, reset: Date.now() + 1000 })

        const result = await checkApiQuota("user-1", freeUser, "drop")

        expect(result).toMatchObject({ success: false, limit: 500, remaining: 0 })
    })
})
