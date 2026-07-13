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
const getOrganizationAccessState = vi.fn()
const touchApiKeyLastUsed = vi.fn()
const hashKey = vi.fn()
const rateLimit = vi.fn()

vi.mock("@/auth", () => ({ auth }))
vi.mock("@/lib/data/auth", () => ({
    getAuthUserState,
    getAuthApiKeyRecord,
    getOrganizationAccessState,
    touchApiKeyLastUsed,
}))
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
    getOrganizationAccessState.mockResolvedValue({ exists: true, suspended: false, subscribed: true })
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
        const route = withPolicy({ auth: "api_key", organizationAccess: "subscribed" }, async (ctx) => {
            scope = scopeFromContext(ctx)
            return new Response("ok")
        })

        await route(apiKeyReq())
        expect(scope!.userId).toBe("u1")
        expect(scope!.organizationId).toBeNull()
        expect(getOrganizationAccessState).not.toHaveBeenCalled()
    })

    it("rejects a suspended org-owned API key before the handler runs", async () => {
        getAuthApiKeyRecord.mockResolvedValue({
            id: "k1",
            expiresAt: null,
            organizationId: "org-9",
            organizationSubscriptions: [],
            user: baseUser,
        })
        getOrganizationAccessState.mockResolvedValue({ exists: true, suspended: true, subscribed: true })
        const handler = vi.fn(async () => new Response("ok"))

        const { withPolicy } = await import("@/lib/route-policy")
        const route = withPolicy({ auth: "api_key", organizationAccess: "subscribed" }, handler)
        const response = await route(apiKeyReq())

        expect(response.status).toBe(403)
        expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } })
        expect(handler).not.toHaveBeenCalled()
    })

    it("rejects an unsubscribed active-org session before the handler runs", async () => {
        auth.mockResolvedValue({
            user: { id: "u1", twoFactorEnabled: false },
            twoFactorVerified: true,
            activeOrganizationId: "org-9",
            activeOrgRole: "owner",
            activeOrgEnforce2FA: false,
        })
        getAuthUserState.mockResolvedValue({ id: "u1", banned: false, subscriptions: [] })
        getOrganizationAccessState.mockResolvedValue({ exists: true, suspended: false, subscribed: false })
        const handler = vi.fn(async () => new Response("ok"))

        const { withPolicy } = await import("@/lib/route-policy")
        const route = withPolicy({ auth: "session", organizationAccess: "subscribed" }, handler)
        const response = await route(new Request("https://x/api/v1/drop"))

        expect(response.status).toBe(402)
        expect(await response.json()).toMatchObject({ error: { code: "PAYMENT_REQUIRED" } })
        expect(handler).not.toHaveBeenCalled()
    })

    it("leaves billing/recovery policies available when they do not opt into the resource gate", async () => {
        getAuthApiKeyRecord.mockResolvedValue({
            id: "k1",
            expiresAt: null,
            organizationId: "org-9",
            organizationSubscriptions: [],
            user: baseUser,
        })
        getOrganizationAccessState.mockResolvedValue({ exists: true, suspended: true, subscribed: false })
        const handler = vi.fn(async () => new Response("ok"))

        const { withPolicy } = await import("@/lib/route-policy")
        const route = withPolicy({ auth: "api_key" }, handler)
        const response = await route(apiKeyReq())

        expect(response.status).toBe(200)
        expect(handler).toHaveBeenCalledOnce()
        expect(getOrganizationAccessState).not.toHaveBeenCalled()
    })
})
