/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const verifyByToken = vi.fn()
const getTurnstileError = vi.fn()

vi.mock("@/lib/services/recipient", () => ({
    RecipientService: {
        verifyByToken,
    },
}))

vi.mock("@/lib/turnstile", () => ({
    getTurnstileError,
}))

describe("verifyRecipientByTokenAction", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        getTurnstileError.mockResolvedValue(null)
        verifyByToken.mockResolvedValue({
            alreadyVerified: false,
            recipient: { email: "recipient@example.com" },
        })
    })

    it("rejects verification before touching the token when turnstile fails", async () => {
        getTurnstileError.mockResolvedValueOnce("Bot verification failed. Please try again.")

        const { verifyRecipientByTokenAction } = await import("@/actions/recipient-verification")
        const result = await verifyRecipientByTokenAction("recipient-token", "bad-captcha")

        expect(getTurnstileError).toHaveBeenCalledWith("bad-captcha")
        expect(verifyByToken).not.toHaveBeenCalled()
        expect(result).toEqual({
            status: "error",
            message: "Bot verification failed. Please try again.",
            isExpired: false,
        })
    })

    it("verifies the recipient after a valid turnstile token", async () => {
        const { verifyRecipientByTokenAction } = await import("@/actions/recipient-verification")
        const result = await verifyRecipientByTokenAction("recipient-token", "captcha-token")

        expect(getTurnstileError).toHaveBeenCalledWith("captcha-token")
        expect(verifyByToken).toHaveBeenCalledWith("recipient-token")
        expect(result).toEqual({
            status: "success",
            email: "recipient@example.com",
        })
    })
})
