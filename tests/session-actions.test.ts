/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const requestPasswordReset = vi.fn()
const getClientIp = vi.fn()
const rateLimit = vi.fn()
const headers = vi.fn()
const cookies = vi.fn()

vi.mock("@/lib/auth", () => ({
    auth: {
        api: {
            requestPasswordReset,
        },
    },
}))

vi.mock("@/lib/rate-limit", () => ({
    getClientIp,
    rateLimit,
    rateLimiters: {},
}))

vi.mock("next/headers", () => ({
    headers,
    cookies,
}))

describe("requestPasswordResetAction", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        getClientIp.mockResolvedValue("203.0.113.5")
        rateLimit.mockResolvedValue(null)
        headers.mockResolvedValue(new Headers({ origin: "http://localhost:3000" }))
        cookies.mockResolvedValue({ get: vi.fn(), toString: vi.fn(() => "") })
    })

    it("normalizes the email and forwards the reset request server-side", async () => {
        const { requestPasswordResetAction } = await import("@/actions/session")

        const result = await requestPasswordResetAction(" User@Example.com ")

        expect(rateLimit).toHaveBeenCalledWith("passwordReset", "203.0.113.5")
        expect(rateLimit).toHaveBeenCalledWith("passwordResetEmail", "user@example.com")
        expect(requestPasswordReset).toHaveBeenCalledWith({
            headers: expect.any(Headers),
            body: {
                email: "user@example.com",
                redirectTo: "http://localhost:3000/reset",
            },
        })
        expect(result.success).toBe(true)
    })

    it("returns the same success payload when rate limited", async () => {
        rateLimit
            .mockResolvedValueOnce(new Response(null, { status: 429 }))
            .mockResolvedValueOnce(null)

        const { requestPasswordResetAction } = await import("@/actions/session")
        const result = await requestPasswordResetAction("user@example.com")

        expect(requestPasswordReset).not.toHaveBeenCalled()
        expect(result).toEqual({
            success: true,
            data: {
                message: "If this email exists in our system, check your email for the reset link.",
            },
        })
    })
})
