/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { APIError } from "@better-auth/core/error"

const h = vi.hoisted(() => ({
    rateLimit: vi.fn(async (_type: string): Promise<Response | null> => null),
    getAuthUserState: vi.fn(),
    getOrganizationSuspension: vi.fn(async (): Promise<{ suspended: boolean; reason: string | null }> => ({ suspended: false, reason: null })),
    recordMemberRemoved: vi.fn(),
    prisma: {
        invitation: { findUnique: vi.fn() },
        organization: { findUnique: vi.fn(), update: vi.fn((args: unknown) => ({ op: "org.update", args })) },
        organizationMemberKey: { deleteMany: vi.fn((args: unknown) => ({ op: "memberKey.deleteMany", args })) },
        apiKey: { deleteMany: vi.fn((args: unknown) => ({ op: "apiKey.deleteMany", args })) },
        session: { update: vi.fn() },
        $transaction: vi.fn(async (ops: unknown[]) => ops),
    },
}))

vi.mock("@/lib/rate-limit", () => ({ rateLimit: h.rateLimit, rateLimiters: {} }))
vi.mock("@/lib/data/auth", () => ({
    getAuthUserState: h.getAuthUserState,
    getOrganizationSuspension: h.getOrganizationSuspension,
}))
vi.mock("@/lib/services/audit", () => ({ recordMemberRemoved: h.recordMemberRemoved }))
vi.mock("@/lib/prisma", () => ({ prisma: h.prisma }))

import {
    mcpOAuthBeforeHook,
    organizationAfterHook,
    organizationBeforeHook,
    revokeOrganizationMemberAccess,
    twoFactorSessionAfterHook,
    type AuthHookContext,
} from "@/lib/auth-hooks"

function ctx(path: string, extra: Partial<AuthHookContext> = {}): AuthHookContext {
    return { path, context: {}, ...extra }
}

const verifiedSession = {
    session: { id: "sess-1", twoFactorVerified: true, activeOrganizationId: "org-1" },
    user: { id: "user-1" },
}

function sessionResolver(session: unknown = verifiedSession) {
    return vi.fn(async () => session)
}

function activeUser(overrides: Record<string, unknown> = {}) {
    return { id: "user-1", banned: false, twoFactorEnabled: false, memberships: [], subscriptions: [], ...overrides }
}

async function rejection(promise: Promise<unknown>) {
    const error = await promise.then(() => null, (e: unknown) => e)
    expect(error).toBeInstanceOf(APIError)
    return error as APIError & { body?: { code?: string } }
}

beforeEach(() => {
    vi.clearAllMocks()
    h.rateLimit.mockResolvedValue(null)
    h.getAuthUserState.mockResolvedValue(activeUser())
    h.getOrganizationSuspension.mockResolvedValue({ suspended: false, reason: null })
    h.prisma.organization.findUnique.mockResolvedValue({ enforce2FA: false })
})

describe("mcpOAuthBeforeHook", () => {
    it("rate limits and validates dynamic client registration", async () => {
        await mcpOAuthBeforeHook(ctx("/oauth2/register", {
            body: { client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] },
        }), sessionResolver())
        expect(h.rateLimit).toHaveBeenCalledWith("mcpRegister")

        const invalid = await rejection(mcpOAuthBeforeHook(ctx("/oauth2/register", {
            body: { client_name: "Bad", redirect_uris: ["http://evil.example/cb"] },
        }), sessionResolver()))
        expect(invalid.body?.code).toBe("INVALID_MCP_CLIENT_REGISTRATION")

        h.rateLimit.mockResolvedValue(new Response(null, { status: 429 }))
        const limited = await rejection(mcpOAuthBeforeHook(ctx("/oauth2/register", { body: {} }), sessionResolver()))
        expect(limited.body?.code).toBe("MCP_REGISTRATION_RATE_LIMITED")
    })

    it("checks the redirect URI on client-facing authorize requests", async () => {
        const request = new Request("https://anon.li/api/auth/oauth2/authorize?x=1")
        await mcpOAuthBeforeHook(ctx("/oauth2/authorize", {
            request,
            query: { redirect_uri: "http://127.0.0.1:5555/callback" },
        }), sessionResolver())
        expect(h.rateLimit).toHaveBeenCalledWith("mcpOAuth")

        const unsafe = await rejection(mcpOAuthBeforeHook(ctx("/oauth2/authorize", {
            request,
            query: { redirect_uri: "javascript:alert(1)" },
        }), sessionResolver()))
        expect(unsafe.body?.code).toBe("INVALID_MCP_REDIRECT_URI")
    })

    it("skips the authorize re-dispatch the consent endpoint performs", async () => {
        await mcpOAuthBeforeHook(ctx("/oauth2/authorize", {
            request: new Request("https://anon.li/api/auth/oauth2/consent", { method: "POST" }),
            query: {},
        }), sessionResolver())
        expect(h.rateLimit).not.toHaveBeenCalled()
    })

    it.each(["/oauth2/token", "/oauth2/revoke"])("rate limits %s", async (path) => {
        h.rateLimit.mockResolvedValue(new Response(null, { status: 429 }))
        const error = await rejection(mcpOAuthBeforeHook(ctx(path), sessionResolver()))
        expect(error.body?.code).toBe("MCP_TOKEN_RATE_LIMITED")
        expect(h.rateLimit).toHaveBeenCalledWith("mcpToken")
    })

    it("lets a verified, active account consent", async () => {
        await mcpOAuthBeforeHook(ctx("/oauth2/consent"), sessionResolver())
        expect(h.getAuthUserState).toHaveBeenCalledWith("user-1")
    })

    it("refuses consent from a session that skipped its 2FA challenge", async () => {
        h.getAuthUserState.mockResolvedValue(activeUser({ twoFactorEnabled: true }))
        const error = await rejection(mcpOAuthBeforeHook(ctx("/oauth2/consent"), sessionResolver({
            ...verifiedSession,
            session: { ...verifiedSession.session, twoFactorVerified: false },
        })))
        expect(error.body?.code).toBe("TWO_FACTOR_REQUIRED")
    })

    it.each([
        ["banned", activeUser({ banned: true })],
        ["deleted or pending deletion", null],
    ])("refuses consent from a %s account", async (_label, state) => {
        h.getAuthUserState.mockResolvedValue(state)
        const error = await rejection(mcpOAuthBeforeHook(ctx("/oauth2/consent"), sessionResolver()))
        expect(error.body?.code).toBe("ACCOUNT_SUSPENDED")
    })

    it("leaves signed-out consent attempts to the endpoint's session middleware", async () => {
        await mcpOAuthBeforeHook(ctx("/oauth2/consent"), sessionResolver(null))
        expect(h.getAuthUserState).not.toHaveBeenCalled()
    })
})

describe("organizationBeforeHook", () => {
    it.each([
        "/organization/list",
        "/organization/get-full-organization",
        "/organization/accept-invitation",
        "/organization/reject-invitation",
        "/organization/set-active",
    ])("does not gate %s", async (path) => {
        const resolve = sessionResolver()
        await organizationBeforeHook(ctx(path), resolve)
        expect(resolve).not.toHaveBeenCalled()
    })

    it("ignores non-organization paths", async () => {
        const resolve = sessionResolver()
        await organizationBeforeHook(ctx("/sign-in/email"), resolve)
        expect(resolve).not.toHaveBeenCalled()
    })

    it.each([
        "/organization/create",
        "/organization/update",
        "/organization/delete",
        "/organization/invite-member",
        "/organization/remove-member",
        "/organization/update-member-role",
        "/organization/cancel-invitation",
        "/organization/leave",
        "/organization/some-future-endpoint",
    ])("rejects a pending-2FA session on %s", async (path) => {
        h.getAuthUserState.mockResolvedValue(activeUser({ twoFactorEnabled: true }))
        const error = await rejection(organizationBeforeHook(ctx(path, { body: { organizationId: "org-1" } }), sessionResolver({
            ...verifiedSession,
            session: { ...verifiedSession.session, twoFactorVerified: false },
        })))
        expect(error.body?.code).toBe("TWO_FACTOR_REQUIRED")
    })

    it("rejects banned users", async () => {
        h.getAuthUserState.mockResolvedValue(activeUser({ banned: true }))
        const error = await rejection(organizationBeforeHook(ctx("/organization/create", { body: { name: "x" } }), sessionResolver()))
        expect(error.body?.code).toBe("ACCOUNT_SUSPENDED")
    })

    it("allows creating an organization without an org context", async () => {
        await organizationBeforeHook(ctx("/organization/create", { body: { name: "x" } }), sessionResolver())
        expect(h.prisma.organization.findUnique).not.toHaveBeenCalled()
    })

    it("enforces the org's 2FA policy for members without 2FA", async () => {
        h.prisma.organization.findUnique.mockResolvedValue({ enforce2FA: true })
        const error = await rejection(organizationBeforeHook(
            ctx("/organization/invite-member", { body: { email: "a@b.c", organizationId: "org-9" } }),
            sessionResolver(),
        ))
        expect(error.body?.code).toBe("ORG_REQUIRES_2FA")
        expect(h.prisma.organization.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "org-9" } }))
    })

    it("lets a member leave an org that enforces 2FA or is suspended", async () => {
        h.prisma.organization.findUnique.mockResolvedValue({ enforce2FA: true })
        h.getOrganizationSuspension.mockResolvedValue({ suspended: true, reason: "abuse" })
        await organizationBeforeHook(ctx("/organization/leave", { body: { organizationId: "org-1" } }), sessionResolver())
    })

    it("still rejects leave from a pending-2FA session or a banned user", async () => {
        h.getAuthUserState.mockResolvedValue(activeUser({ banned: true }))
        const banned = await rejection(organizationBeforeHook(ctx("/organization/leave", { body: { organizationId: "org-1" } }), sessionResolver()))
        expect(banned.body?.code).toBe("ACCOUNT_SUSPENDED")
    })

    it("rejects other writes in a suspended org", async () => {
        h.getOrganizationSuspension.mockResolvedValue({ suspended: true, reason: "abuse" })
        const error = await rejection(organizationBeforeHook(ctx("/organization/update", { body: { organizationId: "org-1" } }), sessionResolver()))
        expect(error.body?.code).toBe("ORG_SUSPENDED")
    })

    it("resolves the org from an invitation, then the active organization", async () => {
        h.prisma.invitation.findUnique.mockResolvedValue({ organizationId: "org-inv" })
        await organizationBeforeHook(ctx("/organization/cancel-invitation", { body: { invitationId: "inv-1" } }), sessionResolver())
        expect(h.getOrganizationSuspension).toHaveBeenLastCalledWith("org-inv")

        await organizationBeforeHook(ctx("/organization/update-member-role", { body: { memberId: "m", role: "admin" } }), sessionResolver())
        expect(h.getOrganizationSuspension).toHaveBeenLastCalledWith("org-1")
    })
})

describe("organization member cleanup", () => {
    it("revokes the vault-key grant and org API keys and flags key rotation", async () => {
        await revokeOrganizationMemberAccess("org-1", "user-2")
        expect(h.prisma.organizationMemberKey.deleteMany).toHaveBeenCalledWith({ where: { organizationId: "org-1", userId: "user-2" } })
        expect(h.prisma.apiKey.deleteMany).toHaveBeenCalledWith({ where: { organizationId: "org-1", userId: "user-2" } })
        expect(h.prisma.organization.update).toHaveBeenCalledWith({
            where: { id: "org-1" },
            data: { keyRotationRecommendedAt: expect.any(Date) },
        })
        expect(h.prisma.$transaction).toHaveBeenCalledTimes(1)
    })

    it("applies the same cleanup after /organization/leave (which skips afterRemoveMember)", async () => {
        await organizationAfterHook(ctx("/organization/leave", {
            context: { returned: { id: "m-1", organizationId: "org-1", userId: "user-2", role: "member" } },
        }))
        expect(h.recordMemberRemoved).toHaveBeenCalledWith({ actorId: "user-2", targetUserId: "user-2", organizationId: "org-1", role: "member" })
        expect(h.prisma.organizationMemberKey.deleteMany).toHaveBeenCalled()
        expect(h.prisma.apiKey.deleteMany).toHaveBeenCalledWith({ where: { organizationId: "org-1", userId: "user-2" } })
    })

    it("does nothing when leave failed or for other paths", async () => {
        await organizationAfterHook(ctx("/organization/leave", { context: { returned: new APIError("BAD_REQUEST") } }))
        await organizationAfterHook(ctx("/organization/remove-member", {
            context: { returned: { organizationId: "org-1", userId: "user-2" } },
        }))
        expect(h.prisma.$transaction).not.toHaveBeenCalled()
        expect(h.recordMemberRemoved).not.toHaveBeenCalled()
    })
})

describe("twoFactorSessionAfterHook", () => {
    it.each(["/two-factor/verify-totp", "/two-factor/verify-backup-code", "/two-factor/verify-otp"])(
        "marks the session minted by %s as 2FA-verified",
        async (path) => {
            await twoFactorSessionAfterHook(ctx(path, {
                context: { newSession: { session: { id: "new-sess" }, user: { id: "user-1" } }, returned: { status: true } },
            }))
            expect(h.prisma.session.update).toHaveBeenCalledWith({ where: { id: "new-sess" }, data: { twoFactorVerified: true } })
        },
    )

    it("ignores failed verifications, requests without a new session, and other paths", async () => {
        await twoFactorSessionAfterHook(ctx("/two-factor/verify-totp", {
            context: { newSession: { session: { id: "s" } }, returned: new APIError("UNAUTHORIZED") },
        }))
        await twoFactorSessionAfterHook(ctx("/two-factor/verify-totp", { context: { returned: { status: true } } }))
        await twoFactorSessionAfterHook(ctx("/sign-in/email", { context: { newSession: { session: { id: "s" } } } }))
        expect(h.prisma.session.update).not.toHaveBeenCalled()
    })
})
