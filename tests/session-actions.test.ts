/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const requestPasswordReset = vi.fn()
const headers = vi.fn()
const cookies = vi.fn()
const getTurnstileError = vi.fn()

vi.mock("@/lib/auth", () => ({
    auth: {
        api: {
            requestPasswordReset,
        },
    },
}))

vi.mock("@/lib/turnstile", () => ({
    getTurnstileError,
}))

vi.mock("next/headers", () => ({
    headers,
    cookies,
}))

describe("requestPasswordResetAction", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        headers.mockResolvedValue(new Headers({ origin: "http://localhost:3000" }))
        cookies.mockResolvedValue({ get: vi.fn(), toString: vi.fn(() => "") })
        getTurnstileError.mockResolvedValue(null)
    })

    it("normalizes the email and forwards the reset request server-side", async () => {
        const { requestPasswordResetAction } = await import("@/actions/session")

        const result = await requestPasswordResetAction(" User@Example.com ")

        expect(requestPasswordReset).toHaveBeenCalledWith({
            headers: expect.any(Headers),
            body: {
                email: "user@example.com",
                redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset`,
            },
        })
        expect(result.success).toBe(true)
    })

    it("rejects reset requests when turnstile validation fails", async () => {
        getTurnstileError.mockResolvedValueOnce("Bot verification failed. Please try again.")

        const { requestPasswordResetAction } = await import("@/actions/session")
        const result = await requestPasswordResetAction("user@example.com", "bad-token")

        expect(getTurnstileError).toHaveBeenCalledWith("bad-token")
        expect(requestPasswordReset).not.toHaveBeenCalled()
        expect(result).toEqual({ error: "Bot verification failed. Please try again." })
    })

    it("returns the same success payload when centralized auth rejects the request", async () => {
        requestPasswordReset.mockRejectedValueOnce(new Error("rate limited"))

        const { requestPasswordResetAction } = await import("@/actions/session")
        const result = await requestPasswordResetAction("user@example.com")

        expect(requestPasswordReset).toHaveBeenCalledOnce()
        expect(result).toEqual({
            success: true,
            data: {
                message: "If this email exists in our system, check your email for the reset link.",
            },
        })
    })
})
