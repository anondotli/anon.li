/**
 * @vitest-environment node
 *
 * Track G: an org-owned API key resolves to ORG OwnerScope inside route handlers
 * (so it reads/writes the org's resources), at "member" least-privilege; a
 * personal key still resolves to personal scope. Exercises the real validateApiKey
 * + withPolicy + scopeFromContext together (getAuthApiKeyRecord is the only mock).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const auth = vi.fn()
const getAuthUserState = vi.fn()
const getAuthApiKeyRecord = vi.fn()
const touchApiKeyLastUsed = vi.fn()
const hashKey = vi.fn()
const rateLimit = vi.fn()

vi.mock("@/auth", () => ({ auth }))
vi.mock("@/lib/data/auth", () => ({ getAuthUserState, getAuthApiKeyRecord, touchApiKeyLastUsed }))
vi.mock("@/lib/services/api-key", () => ({ ApiKeyService: { hashKey } }))
vi.mock("@/lib/api-rate-limit", () => ({
    checkApiQuota: vi.fn().mockResolvedValue({ success: true, limit: 500, remaining: 499, reset: new Date() }),
    createRateLimitHeaders: vi.fn().mockReturnValue(new Headers()),
}))
vi.mock("@/lib/rate-limit", () => ({ rateLimit, rateLimiters: { api: null } }))
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn() } } }))

const apiKeyReq = () =>
    new Request("https://x/api/v1/alias", { headers: { authorization: "Bearer ak_test" } })

const baseUser = { id: "u1", banned: false, subscriptions: [], referralPlusUntil: null }

beforeEach(() => {
    vi.clearAllMocks()
    hashKey.mockReturnValue("hashed")
    touchApiKeyLastUsed.mockResolvedValue(undefined)
})

describe("withPolicy — API key OwnerScope", () => {
    it("org-owned key → org scope at member least-privilege", async () => {
        getAuthApiKeyRecord.mockResolvedValue({
            id: "k1",
            expiresAt: null,
            organizationId: "org-9",
            organizationSubscriptions: [],
            user: baseUser,
        })

        const { withPolicy, scopeFromContext } = await import("@/lib/route-policy")
        let scope: ReturnType<typeof scopeFromContext> | undefined
        const route = withPolicy({ auth: "api_key" }, async (ctx) => {
            scope = scopeFromContext(ctx)
            return new Response("ok")
        })

        const res = await route(apiKeyReq())
        expect(res.status).toBe(200)
        expect(scope!.userId).toBe("u1")
        expect(scope!.organizationId).toBe("org-9")
        expect(scope!.role).toBe("member")
    })

    it("personal key → personal scope (no org context)", async () => {
        getAuthApiKeyRecord.mockResolvedValue({
            id: "k1",
            expiresAt: null,
            organizationId: null,
            organizationSubscriptions: null,
            user: baseUser,
        })

        const { withPolicy, scopeFromContext } = await import("@/lib/route-policy")
        let scope: ReturnType<typeof scopeFromContext> | undefined
        const route = withPolicy({ auth: "api_key" }, async (ctx) => {
            scope = scopeFromContext(ctx)
            return new Response("ok")
        })

        await route(apiKeyReq())
        expect(scope!.userId).toBe("u1")
        expect(scope!.organizationId).toBeNull()
    })
})
