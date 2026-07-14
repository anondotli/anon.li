/**
 * @vitest-environment node
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

interface AuthHookSession {
    user: { id: string }
}

interface AuthHookContext {
    path: string
    body?: unknown
    context: { session: AuthHookSession | null }
}

type AuthBeforeHook = (ctx: AuthHookContext) => Promise<void>

const harness = vi.hoisted(() => ({
    authOptions: null as unknown,
    getSessionFromCtx: vi.fn(async (): Promise<{ user: { id: string } } | null> => null),
    rateLimit: vi.fn(async (_type: string, _identifier?: string): Promise<Response | null> => null),
}))

vi.mock("better-auth", () => ({
    betterAuth: vi.fn((options: unknown) => {
        harness.authOptions = options
        return { api: {}, handler: vi.fn() }
    }),
}))

vi.mock("better-auth/adapters/prisma", () => ({
    prismaAdapter: vi.fn(() => ({})),
}))

vi.mock("better-auth/plugins", () => ({
    captcha: vi.fn(() => ({ id: "captcha" })),
    magicLink: vi.fn(() => ({ id: "magic-link" })),
    mcp: vi.fn(() => ({ id: "mcp" })),
    organization: vi.fn(() => ({ id: "organization" })),
    twoFactor: vi.fn(() => ({ id: "two-factor" })),
}))

vi.mock("better-auth/api", () => ({
    createAuthMiddleware: vi.fn((handler: unknown) => handler),
    getSessionFromCtx: harness.getSessionFromCtx,
}))

vi.mock("@/lib/rate-limit", () => ({
    rateLimit: harness.rateLimit,
    rateLimiters: {},
}))

vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/resend", () => ({
    sendAccountVerificationEmail: vi.fn(),
    sendMagicLinkEmail: vi.fn(),
    sendOrganizationInvitationEmail: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
    sendWelcomeEmail: vi.fn(),
}))
vi.mock("@/lib/auth-permissions", () => ({ ac: {}, roles: {} }))
vi.mock("@/lib/org-seats", () => ({ getOrgSeatLimit: vi.fn(() => 10) }))
vi.mock("@/lib/validations/organization", () => ({
    validateOrganizationName: vi.fn((name: string) => ({ name })),
}))
vi.mock("@/lib/services/audit", () => ({
    recordInvitationSent: vi.fn(),
    recordMemberAdded: vi.fn(),
    recordMemberRemoved: vi.fn(),
    recordMemberRoleChanged: vi.fn(),
}))
vi.mock("@/lib/mcp/oauth-metadata", () => ({
    MCP_DEFAULT_SCOPE: "anon.li:aliases",
    MCP_OAUTH_SCOPES: ["anon.li:aliases"],
}))
vi.mock("@/lib/vault/personal-purge", () => ({
    purgePersonalVaultKeysOps: vi.fn(() => []),
}))

function beforeHook(): AuthBeforeHook {
    const options = harness.authOptions as { hooks?: { before?: AuthBeforeHook } }
    if (!options.hooks?.before) throw new Error("Auth before hook was not configured")
    return options.hooks.before
}

function hookContext(path: string, body?: unknown): AuthHookContext {
    return { path, body, context: { session: null } }
}

function limiterCalls(): Array<[type: string, identifier?: string]> {
    return harness.rateLimit.mock.calls as Array<[type: string, identifier?: string]>
}

function identifierWithPrefix(type: string, prefix: string): string {
    const identifier = limiterCalls()
        .filter(([calledType]) => calledType === type)
        .map(([, calledIdentifier]) => calledIdentifier)
        .find((value): value is string => typeof value === "string" && value.startsWith(prefix))

    if (!identifier) throw new Error(`No ${prefix} identifier found for ${type}`)
    return identifier
}

describe("Better Auth endpoint rate limiting", () => {
    beforeAll(async () => {
        process.env.AUTH_SECRET = "auth-rate-limit-test-secret-with-sufficient-entropy"
        await import("@/lib/auth")
    })

    beforeEach(() => {
        harness.rateLimit.mockReset()
        harness.rateLimit.mockResolvedValue(null)
        harness.getSessionFromCtx.mockReset()
        harness.getSessionFromCtx.mockResolvedValue(null)
    })

    it("keys direct password-reset requests by IP and normalized opaque target", async () => {
        await beforeHook()(hookContext("/request-password-reset", {
            email: " User@Example.COM ",
        }))

        expect(harness.rateLimit).toHaveBeenCalledWith("passwordReset")
        const firstTarget = identifierWithPrefix("passwordResetEmail", "target:")
        expect(firstTarget).toMatch(/^target:[a-f0-9]{64}$/)
        expect(firstTarget).not.toContain("user@example.com")

        harness.rateLimit.mockClear()
        await beforeHook()(hookContext("/request-password-reset", {
            email: "user@example.com",
        }))

        expect(identifierWithPrefix("passwordResetEmail", "target:")).toBe(firstTarget)
    })

    it("rejects direct reset requests and reset submissions when the IP bucket is exhausted", async () => {
        harness.rateLimit.mockImplementation(async (type) =>
            type === "passwordReset" ? new Response(null, { status: 429 }) : null,
        )

        await expect(beforeHook()(hookContext("/request-password-reset", {
            email: "user@example.com",
        }))).rejects.toMatchObject({
            statusCode: 429,
            body: { code: "PASSWORD_RESET_RATE_LIMITED" },
        })
        expect(harness.rateLimit).toHaveBeenCalledWith("passwordResetEmail", expect.stringMatching(/^target:/))

        harness.rateLimit.mockClear()
        await expect(beforeHook()(hookContext("/reset-password", {
            token: "never-use-reset-tokens-as-limiter-identifiers",
            newPassword: "correct horse battery staple",
        }))).rejects.toMatchObject({
            statusCode: 429,
            body: { code: "PASSWORD_RESET_RATE_LIMITED" },
        })
        expect(limiterCalls()).toEqual([["passwordReset"]])
    })

    it("limits verification resends by IP and normalized target without exposing the email", async () => {
        harness.rateLimit.mockImplementation(async (type, identifier) =>
            type === "emailResend" && identifier?.startsWith("target:")
                ? new Response(null, { status: 429 })
                : null,
        )

        await expect(beforeHook()(hookContext("/send-verification-email", {
            email: " Verify.Me@Example.com ",
        }))).rejects.toMatchObject({
            statusCode: 429,
            body: { code: "EMAIL_VERIFICATION_RATE_LIMITED" },
        })

        expect(harness.rateLimit).toHaveBeenCalledWith("emailResend")
        const target = identifierWithPrefix("emailResend", "target:")
        expect(target).not.toContain("verify.me@example.com")
    })

    it("limits organization invitation resends by IP, authenticated actor, and target", async () => {
        harness.getSessionFromCtx.mockResolvedValue({ user: { id: "inviter-user-id" } })
        harness.rateLimit.mockImplementation(async (type, identifier) =>
            type === "orgInvite" && identifier?.startsWith("actor:")
                ? new Response(null, { status: 429 })
                : null,
        )

        await expect(beforeHook()(hookContext("/organization/invite-member", {
            email: " Invitee@Example.com ",
            role: "member",
            resend: true,
        }))).rejects.toMatchObject({
            statusCode: 429,
            body: { code: "ORG_INVITE_RATE_LIMITED" },
        })

        expect(harness.getSessionFromCtx).toHaveBeenCalledOnce()
        expect(harness.rateLimit).toHaveBeenCalledWith("orgInvite")
        const actor = identifierWithPrefix("orgInvite", "actor:")
        const target = identifierWithPrefix("orgInvite", "target:")
        expect(actor).not.toContain("inviter-user-id")
        expect(target).not.toContain("invitee@example.com")
    })

    it("keeps password, magic-link, and 2FA sign-in guards active", async () => {
        await beforeHook()(hookContext("/sign-in/email", { email: "user@example.com" }))
        expect(harness.rateLimit).toHaveBeenCalledWith("signIn")
        expect(harness.rateLimit).toHaveBeenCalledWith("signIn", expect.stringMatching(/^target:[a-f0-9]{64}$/))

        harness.rateLimit.mockClear()
        await beforeHook()(hookContext("/sign-in/magic-link", { email: "user@example.com" }))
        expect(harness.rateLimit).toHaveBeenCalledWith("signIn")
        expect(identifierWithPrefix("signIn", "target:")).toMatch(/^target:[a-f0-9]{64}$/)

        harness.rateLimit.mockReset()
        harness.rateLimit.mockResolvedValue(new Response(null, { status: 429 }))
        await expect(beforeHook()(hookContext("/two-factor/verify-totp", { code: "123456" })))
            .rejects.toMatchObject({
                statusCode: 429,
                body: { code: "TWO_FACTOR_RATE_LIMITED" },
            })
        expect(limiterCalls()).toEqual([["twoFactorVerifyIp"]])
    })
})
