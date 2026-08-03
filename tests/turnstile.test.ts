import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { validateTurnstileToken } from "@/lib/turnstile"

describe("Turnstile verification", () => {
    beforeEach(() => {
        vi.stubEnv("TURNSTILE_SECRET_KEY", "turnstile-secret")
    })

    afterEach(() => {
        vi.unstubAllEnvs()
        vi.unstubAllGlobals()
    })

    it("accepts only an explicit successful Siteverify response", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(
            JSON.stringify({ success: true }),
            { status: 200, headers: { "content-type": "application/json" } },
        ))
        vi.stubGlobal("fetch", fetchMock)

        await expect(validateTurnstileToken("valid-token")).resolves.toBe(true)
        expect(fetchMock).toHaveBeenCalledOnce()
    })

    it("fails closed on malformed success values and non-success HTTP responses", async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ success: "true" }), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 503 }))
        vi.stubGlobal("fetch", fetchMock)

        await expect(validateTurnstileToken("malformed-token")).resolves.toBe(false)
        await expect(validateTurnstileToken("upstream-error-token")).resolves.toBe(false)
    })

    it("does not call Siteverify without configured credentials or a bounded token", async () => {
        const fetchMock = vi.fn()
        vi.stubGlobal("fetch", fetchMock)
        vi.stubEnv("TURNSTILE_SECRET_KEY", "")

        await expect(validateTurnstileToken("token")).resolves.toBe(false)

        vi.stubEnv("TURNSTILE_SECRET_KEY", "turnstile-secret")
        await expect(validateTurnstileToken("x".repeat(2049))).resolves.toBe(false)
        expect(fetchMock).not.toHaveBeenCalled()
    })
})
