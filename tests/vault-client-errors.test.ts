/**
 * @vitest-environment jsdom
 *
 * readVaultApiData must turn every non-OK vault response into a readable
 * error. The rate limiter answers with a flat `{ error: "Too many requests" }`
 * body, not the `{ error: { message, code } }` API shape — that used to surface
 * as a bare "Request failed" (e.g. when changing the vault password).
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { readVaultApiData, VaultApiError } from "@/lib/vault/client"

function stubResponse(status: number, body: unknown) {
    const text = typeof body === "string" ? body : JSON.stringify(body)
    vi.stubGlobal("fetch", vi.fn(async () => new Response(text, { status })))
}

async function readError(): Promise<VaultApiError> {
    try {
        await readVaultApiData("/api/vault/change-password", { method: "POST", body: "{}" })
    } catch (error) {
        expect(error).toBeInstanceOf(VaultApiError)
        return error as VaultApiError
    }
    throw new Error("expected readVaultApiData to throw")
}

describe("readVaultApiData errors", () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it("uses the message and code of a standard API error", async () => {
        stubResponse(401, { error: { message: "Incorrect password", code: "UNAUTHORIZED" } })

        const error = await readError()
        expect(error.message).toBe("Incorrect password")
        expect(error.code).toBe("UNAUTHORIZED")
    })

    it("explains a rate-limited response with the retry window", async () => {
        stubResponse(429, {
            error: "Too many requests",
            message: "Rate limit exceeded. Please try again later.",
            retryAfter: 125,
        })

        const error = await readError()
        expect(error.message).toBe("Too many attempts. Please try again in 3 minutes.")
        expect(error.code).toBe("RATE_LIMITED")
    })

    it("explains a rate-limited response without a retry window", async () => {
        stubResponse(429, "")

        const error = await readError()
        expect(error.message).toBe("Too many attempts. Please try again later.")
        expect(error.code).toBe("RATE_LIMITED")
    })

    it("uses a top-level message from a flat error body", async () => {
        stubResponse(503, {
            error: "Service temporarily unavailable",
            message: "We couldn't verify this request right now. Please try again shortly.",
        })

        const error = await readError()
        expect(error.message).toBe("We couldn't verify this request right now. Please try again shortly.")
    })

    it("falls back to a status-based message for a non-JSON body", async () => {
        stubResponse(502, "<html>Bad Gateway</html>")
        expect((await readError()).message).toBe("Something went wrong on our side. Please try again.")

        stubResponse(403, "Forbidden")
        expect((await readError()).message).toBe("Request failed (403)")
    })
})
