/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const { auth, getAuthUserState, rateLimit } = vi.hoisted(() => ({
    auth: vi.fn(),
    getAuthUserState: vi.fn(),
    rateLimit: vi.fn(),
}))

vi.mock("@/auth", () => ({ auth }))
vi.mock("@/lib/data/auth", () => ({
    getAuthUserState,
    getAuthApiKeyRecord: vi.fn().mockResolvedValue(null),
    getOrganizationAccessState: vi.fn(),
    touchApiKeyLastUsed: vi.fn(),
}))
vi.mock("@/lib/services/api-key", () => ({ ApiKeyService: { hashKey: vi.fn() } }))
vi.mock("@/lib/api-rate-limit", () => ({
    checkApiQuota: vi.fn(),
    createRateLimitHeaders: vi.fn().mockReturnValue(new Headers()),
}))
vi.mock("@/lib/rate-limit", () => ({ rateLimit, rateLimiters: { api: null, formSubmitAuth: null } }))
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn() }, member: { findUnique: vi.fn() } } }))
vi.mock("@/lib/csrf", () => ({ validateCsrf: vi.fn() }))

import { withPolicy } from "@/lib/route-policy"

function legacy429(reset: number) {
    return NextResponse.json(
        { error: "Too many requests", message: "Rate limit exceeded. Please try again later.", retryAfter: 30 },
        {
            status: 429,
            headers: {
                "X-RateLimit-Limit": "10",
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Reset": reset.toString(),
                "Retry-After": "30",
            },
        },
    )
}

const sessionOf = (opts: { twoFactorEnabled: boolean; twoFactorVerified: boolean; activeOrgEnforce2FA?: boolean }) => ({
    user: { id: "u1", twoFactorEnabled: opts.twoFactorEnabled },
    twoFactorVerified: opts.twoFactorVerified,
    activeOrganizationId: opts.activeOrgEnforce2FA ? "org-1" : null,
    activeOrgRole: opts.activeOrgEnforce2FA ? "member" : null,
    activeOrgEnforce2FA: opts.activeOrgEnforce2FA ?? false,
})

beforeEach(() => {
    vi.clearAllMocks()
    auth.mockResolvedValue(null)
    rateLimit.mockResolvedValue(null)
    getAuthUserState.mockResolvedValue({ id: "u1", banned: false, subscriptions: [] })
})

describe("withPolicy — per-request 429 uses the documented error envelope", () => {
    it("returns { error: { message, code }, meta: { request_id } } with rate-limit headers and no-store", async () => {
        auth.mockResolvedValue(sessionOf({ twoFactorEnabled: false, twoFactorVerified: false }))
        const reset = Date.now() + 30_000
        rateLimit.mockResolvedValue(legacy429(reset))
        const handler = vi.fn()

        const response = await withPolicy({ auth: "session", rateLimit: "api" }, handler)(
            new Request("https://x/api/v1/me"),
        )

        expect(response.status).toBe(429)
        expect(handler).not.toHaveBeenCalled()
        const requestId = response.headers.get("X-Request-Id")
        expect(requestId).toBeTruthy()
        expect(await response.json()).toEqual({
            error: { message: expect.any(String), code: "RATE_LIMITED" },
            meta: { request_id: requestId },
        })
        expect(response.headers.get("X-RateLimit-Limit")).toBe("10")
        expect(response.headers.get("X-RateLimit-Remaining")).toBe("0")
        expect(response.headers.get("X-RateLimit-Reset")).toBe(reset.toString())
        expect(response.headers.get("Retry-After")).toBe("30")
        expect(response.headers.get("Cache-Control")).toContain("no-store")
    })

    it("re-shapes a fail-closed 503 into the envelope too", async () => {
        auth.mockResolvedValue(sessionOf({ twoFactorEnabled: false, twoFactorVerified: false }))
        rateLimit.mockResolvedValue(NextResponse.json(
            { error: "Service temporarily unavailable", message: "..." },
            { status: 503, headers: { "Retry-After": "30" } },
        ))

        const response = await withPolicy({ auth: "session", rateLimit: "api" }, vi.fn())(
            new Request("https://x/api/v1/me"),
        )

        expect(response.status).toBe(503)
        expect(await response.json()).toMatchObject({ error: { code: "SERVICE_UNAVAILABLE" } })
        expect(response.headers.get("Retry-After")).toBe("30")
    })
})

describe("withPolicy — optional_api_key_or_session with a session failing 2FA gates", () => {
    const submitPolicy = { auth: "optional_api_key_or_session" as const, rateLimit: "formSubmitAuth" as const }

    it("treats a mid-2FA-challenge session as anonymous instead of 401", async () => {
        auth.mockResolvedValue(sessionOf({ twoFactorEnabled: true, twoFactorVerified: false }))
        let seen: { userId: string | null; organizationId: string | null } | undefined
        const route = withPolicy(submitPolicy, async (ctx) => {
            seen = { userId: ctx.userId, organizationId: ctx.organizationId }
            return new Response("ok")
        })

        const response = await route(new Request("https://x/api/v1/form/f1/submit", { method: "POST" }))

        expect(response.status).toBe(200)
        expect(seen).toEqual({ userId: null, organizationId: null })
        expect(getAuthUserState).not.toHaveBeenCalled()
    })

    it("treats an org-enforce-2FA-unenrolled session as anonymous instead of 403", async () => {
        auth.mockResolvedValue(sessionOf({ twoFactorEnabled: false, twoFactorVerified: false, activeOrgEnforce2FA: true }))
        let seenUserId: string | null | undefined
        const route = withPolicy(submitPolicy, async (ctx) => {
            seenUserId = ctx.userId
            return new Response("ok")
        })

        const response = await route(new Request("https://x/api/v1/form/f1/submit", { method: "POST" }))

        expect(response.status).toBe(200)
        expect(seenUserId).toBeNull()
    })

    it("keeps rejecting such sessions on required-auth routes", async () => {
        auth.mockResolvedValue(sessionOf({ twoFactorEnabled: true, twoFactorVerified: false }))
        const handler = vi.fn()

        const response = await withPolicy({ auth: "api_key_or_session", rateLimit: "api" }, handler)(
            new Request("https://x/api/v1/drop"),
        )

        expect(response.status).toBe(401)
        expect(handler).not.toHaveBeenCalled()
    })

    it("still authenticates a fully verified session in optional mode", async () => {
        auth.mockResolvedValue(sessionOf({ twoFactorEnabled: true, twoFactorVerified: true }))
        let seenUserId: string | null | undefined
        const route = withPolicy(submitPolicy, async (ctx) => {
            seenUserId = ctx.userId
            return new Response("ok")
        })

        await route(new Request("https://x/api/v1/form/f1/submit", { method: "POST" }))

        expect(seenUserId).toBe("u1")
    })
})
