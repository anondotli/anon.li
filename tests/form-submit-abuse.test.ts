/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest"

const { recordSubmission, validateTurnstileToken, rateLimit } = vi.hoisted(() => ({
    recordSubmission: vi.fn(),
    validateTurnstileToken: vi.fn(),
    rateLimit: vi.fn(),
}))

vi.mock("next/server", async (importOriginal) => {
    const actual = await importOriginal<typeof import("next/server")>()
    return { ...actual, after: vi.fn() }
})
vi.mock("@/lib/route-policy", () => ({
    withPolicy: (
        _policy: unknown,
        handler: (ctx: Record<string, unknown>, route: unknown) => unknown,
    ) => (request: Request, route: unknown) => handler({
        request,
        requestId: "request-1",
        userId: "authenticated-attacker",
    }, route),
}))
vi.mock("@/lib/services/form", () => ({ FormService: { recordSubmission } }))
vi.mock("@/lib/services/form-notifications", () => ({ notifyFormSubmission: vi.fn() }))
vi.mock("@/lib/turnstile", () => ({ validateTurnstileToken }))
vi.mock("@/lib/rate-limit", () => ({
    getClientIp: vi.fn().mockResolvedValue("203.0.113.10"),
    rateLimit,
}))

import { POST } from "@/app/api/v1/form/[id]/submit/route"

function request(turnstileToken?: string): Request {
    return new Request("https://anon.li/api/v1/form/abcdefghijkl/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            ephemeralPubKey: "A".repeat(87),
            iv: "I".repeat(16),
            encryptedPayload: "ciphertext",
            ...(turnstileToken ? { turnstileToken } : {}),
        }),
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    rateLimit.mockResolvedValue(null)
})

describe("public Form submission abuse gates", () => {
    it("requires Turnstile even when the respondent is authenticated", async () => {
        const response = await POST(request(), {
            params: Promise.resolve({ id: "abcdefghijkl" }),
        })

        expect(response.status).toBe(400)
        expect(recordSubmission).not.toHaveBeenCalled()
        expect(rateLimit).toHaveBeenCalledWith("formSubmit", "203.0.113.10")
    })

    it("rejects a failed Turnstile check before spending the target quota", async () => {
        validateTurnstileToken.mockResolvedValue(false)

        const response = await POST(request("captcha-token"), {
            params: Promise.resolve({ id: "abcdefghijkl" }),
        })

        expect(response.status).toBe(400)
        expect(validateTurnstileToken).toHaveBeenCalledWith("captcha-token")
        expect(recordSubmission).not.toHaveBeenCalled()
    })
})
