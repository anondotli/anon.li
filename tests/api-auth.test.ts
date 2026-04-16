/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const auth = vi.fn()
const getAuthUserState = vi.fn()
const getAuthApiKeyRecord = vi.fn()
const touchApiKeyLastUsed = vi.fn()
const hashKey = vi.fn()

vi.mock("@/auth", () => ({ auth }))

vi.mock("@/lib/data/auth", () => ({
    getAuthUserState,
    getAuthApiKeyRecord,
    touchApiKeyLastUsed,
}))

vi.mock("@/lib/services/api-key", () => ({
    ApiKeyService: {
        hashKey,
    },
}))

vi.mock("@/lib/api-rate-limit", () => ({
    checkApiQuota: vi.fn().mockResolvedValue({
        success: true,
        limit: 500,
        remaining: 499,
        reset: new Date("2026-04-16T00:00:00.000Z"),
    }),
    createRateLimitHeaders: vi.fn().mockReturnValue(new Headers()),
}))

vi.mock("@/lib/rate-limit", () => ({
    rateLimiters: {
        api: null,
    },
}))

describe("api auth", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        hashKey.mockReturnValue("hashed-key")
        getAuthUserState.mockResolvedValue({
            id: "user-123",
            banned: false,
            isAdmin: false,
            stripeSubscriptionId: null,
            stripePriceId: null,
            stripeCurrentPeriodEnd: null,
        })
    })

    it("recognizes only explicit ak_ bearer tokens as API key attempts", async () => {
        const { hasExplicitApiKey } = await import("@/lib/api-auth")

        expect(hasExplicitApiKey(new Request("http://localhost", {
            headers: { authorization: "Bearer ak_test" },
        }))).toBe(true)
        expect(hasExplicitApiKey(new Request("http://localhost", {
            headers: { authorization: "Bearer not-an-api-key" },
        }))).toBe(false)
        expect(hasExplicitApiKey(new Request("http://localhost"))).toBe(false)
    })

    it("fails closed on invalid explicit API keys even when a valid session exists", async () => {
        auth.mockResolvedValue({
            user: { id: "user-123", twoFactorEnabled: false },
            twoFactorVerified: true,
        })
        getAuthApiKeyRecord.mockResolvedValue(null)

        const { validateRequest } = await import("@/lib/api-auth")
        const request = new Request("http://localhost/api/v1/me", {
            headers: { authorization: "Bearer ak_invalid" },
        })

        await expect(validateRequest(request, "alias")).resolves.toBeNull()
        expect(auth).not.toHaveBeenCalled()
    })
})
