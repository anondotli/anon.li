/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const auth = vi.fn()
const rateLimit = vi.fn()
const readApiRateLimit = vi.fn()
const readDropApiRateLimit = vi.fn()
const checkApiRateLimit = vi.fn()
const checkDropApiRateLimit = vi.fn()

const prismaUserFindUnique = vi.fn()

vi.mock("@/auth", () => ({ auth }))

vi.mock("@/lib/prisma", () => ({
    prisma: {
        user: { findUnique: prismaUserFindUnique },
    },
}))

vi.mock("@/lib/rate-limit", () => ({
    rateLimit,
    rateLimiters: {},
}))

vi.mock("@/lib/api-rate-limit", () => ({
    readApiRateLimit,
    readDropApiRateLimit,
    checkApiRateLimit,
    checkDropApiRateLimit,
}))

describe("GET /api/user/usage", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        auth.mockResolvedValue({ user: { id: "user-123" } })
        rateLimit.mockResolvedValue(null)
        prismaUserFindUnique.mockResolvedValue({ subscriptions: [] })
        readApiRateLimit.mockResolvedValue({ success: true, limit: 500, remaining: 450, reset: new Date("2026-04-16T00:00:00.000Z") })
        readDropApiRateLimit.mockResolvedValue({ success: true, limit: 500, remaining: 475, reset: new Date("2026-04-16T00:00:00.000Z") })
    })

    it("reads quota state without consuming monthly API quota", async () => {
        const { GET } = await import("@/app/api/user/usage/route")

        const response = await GET()
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.alias.used).toBe(50)
        expect(body.drop.used).toBe(25)
        expect(readApiRateLimit).toHaveBeenCalledWith("user-123", { subscriptions: [] })
        expect(readDropApiRateLimit).toHaveBeenCalledWith("user-123", { subscriptions: [] })
        expect(checkApiRateLimit).not.toHaveBeenCalled()
        expect(checkDropApiRateLimit).not.toHaveBeenCalled()
    })
})
