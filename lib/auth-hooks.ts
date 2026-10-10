import "server-only"

import { APIError } from "@better-auth/core/error"
import { prisma } from "@/lib/prisma"
import { rateLimit } from "@/lib/rate-limit"
import { getAuthUserState, getOrganizationSuspension } from "@/lib/data/auth"
import { recordMemberRemoved } from "@/lib/services/audit"
import { isSafeMcpRedirectUri, validateMcpClientRegistration } from "@/lib/mcp/client-registration"
import { createLogger } from "@/lib/logger"

const logger = createLogger("AuthHooks")

/**
 * The slice of better-auth's hook context these guards read. The real context
 * (from `createAuthMiddleware`) is structurally assignable to it.
 */
export interface AuthHookContext {
    path?: string
    body?: unknown
    query?: unknown
    request?: Request
    context: {
        returned?: unknown
        newSession?: unknown
    }
}

interface HookSession {
    session: { id: string; twoFactorVerified?: boolean | null; activeOrganizationId?: string | null }
    user: { id: string }
}

/** Resolves the acting session for the current request (cached session or cookie lookup). */
export type ResolveHookSession = () => Promise<unknown>

function asHookSession(value: unknown): HookSession | null {
    if (!value || typeof value !== "object") return null
    const record = value as { session?: unknown; user?: unknown }
    const session = record.session as HookSession["session"] | undefined
    const user = record.user as HookSession["user"] | undefined
    if (!session || typeof session.id !== "string" || !user || typeof user.id !== "string") return null
    return { session, user }
}

function field(source: unknown, key: string): unknown {
    return source && typeof source === "object" ? (source as Record<string, unknown>)[key] : undefined
}

function stringField(source: unknown, key: string): string | null {
    const value = field(source, key)
    return typeof value === "string" && value.length > 0 ? value : null
}

function tooManyRequests(code: string) {
    return APIError.from("TOO_MANY_REQUESTS", {
        message: "Too many attempts. Please try again later.",
        code,
    })
}

function forbidden(code: string, message: string) {
    return APIError.from("FORBIDDEN", { message, code })
}

/** Path of the HTTP request being served (the internal consent → authorize dispatch keeps the consent URL). */
function requestPathname(ctx: AuthHookContext): string | null {
    if (!ctx.request) return null
    try {
        return new URL(ctx.request.url).pathname
    } catch {
        return null
    }
}

/**
 * Account-level gate shared by OAuth consent and organization writes: the
 * session must have completed its 2FA challenge, and the account must exist,
 * not be pending deletion and not be banned.
 */
async function assertActiveVerifiedAccount(session: HookSession): Promise<{ twoFactorEnabled: boolean }> {
    const state = await getAuthUserState(session.user.id)
    if (!state || state.banned) {
        throw forbidden("ACCOUNT_SUSPENDED", "This account cannot perform this action.")
    }
    if (state.twoFactorEnabled && !session.session.twoFactorVerified) {
        throw forbidden("TWO_FACTOR_REQUIRED", "Complete two-factor authentication first.")
    }
    return { twoFactorEnabled: state.twoFactorEnabled }
}

// ── OAuth provider endpoints (MCP) ──────────────────────────────────────────

/**
 * Brute-force / abuse protection and policy checks for the OAuth provider
 * endpoints. Parameter *rewriting* happens at the HTTP boundary
 * (lib/mcp/oauth-request.ts); these hooks only validate, so they are safe to
 * run again when the provider re-dispatches authorize after consent.
 */
export async function mcpOAuthBeforeHook(ctx: AuthHookContext, resolveSession: ResolveHookSession): Promise<void> {
    switch (ctx.path) {
        case "/oauth2/register": {
            if (await rateLimit("mcpRegister")) throw tooManyRequests("MCP_REGISTRATION_RATE_LIMITED")
            const registrationError = validateMcpClientRegistration(ctx.body)
            if (registrationError) {
                throw APIError.from("BAD_REQUEST", {
                    message: registrationError,
                    code: "INVALID_MCP_CLIENT_REGISTRATION",
                })
            }
            return
        }
        case "/oauth2/authorize": {
            // Only the client-facing request; the post-consent re-dispatch runs
            // inside the consent request and was validated when it started.
            if (!requestPathname(ctx)?.endsWith("/oauth2/authorize")) return
            if (await rateLimit("mcpOAuth")) throw tooManyRequests("MCP_AUTHORIZATION_RATE_LIMITED")
            if (!isSafeMcpRedirectUri(field(ctx.query, "redirect_uri"))) {
                throw APIError.from("BAD_REQUEST", {
                    message: "Invalid or insecure redirect URI",
                    code: "INVALID_MCP_REDIRECT_URI",
                })
            }
            return
        }
        case "/oauth2/token":
        case "/oauth2/revoke": {
            if (await rateLimit("mcpToken")) throw tooManyRequests("MCP_TOKEN_RATE_LIMITED")
            return
        }
        case "/oauth2/consent": {
            if (await rateLimit("mcpOAuth")) throw tooManyRequests("MCP_CONSENT_RATE_LIMITED")
            // A session that skipped its 2FA challenge (magic link, social) or a
            // banned account must not grant a third party access to the account.
            // No session at all is rejected by the endpoint's own middleware.
            const session = asHookSession(await resolveSession())
            if (session) await assertActiveVerifiedAccount(session)
            return
        }
    }
}

// ── Organization endpoints ──────────────────────────────────────────────────

/** Organization endpoints that only read, or only act on the caller's own invitation/active context. */
const UNGATED_ORGANIZATION_PATHS = new Set([
    "/organization/check-slug",
    "/organization/get-active-member",
    "/organization/get-active-member-role",
    "/organization/get-full-organization",
    "/organization/get-invitation",
    "/organization/get-organization",
    "/organization/get-role",
    "/organization/has-permission",
    "/organization/list",
    "/organization/list-invitations",
    "/organization/list-members",
    "/organization/list-roles",
    "/organization/list-team-members",
    "/organization/list-teams",
    "/organization/list-user-invitations",
    "/organization/list-user-teams",
    "/organization/accept-invitation",
    "/organization/reject-invitation",
    "/organization/set-active",
    "/organization/set-active-team",
])

async function resolveTargetOrganizationId(ctx: AuthHookContext, session: HookSession): Promise<string | null> {
    const fromBody = stringField(ctx.body, "organizationId")
    if (fromBody) return fromBody
    const invitationId = stringField(ctx.body, "invitationId")
    if (invitationId) {
        const invitation = await prisma.invitation.findUnique({
            where: { id: invitationId },
            select: { organizationId: true },
        })
        if (invitation) return invitation.organizationId
    }
    return session.session.activeOrganizationId ?? null
}

/**
 * The dashboard calls the organization plugin's endpoints directly from the
 * browser (authClient.organization.*), so the checks `runScopedAction`
 * applies to org-scoped server actions must also run here. Every
 * `/organization/*` endpoint not explicitly listed as ungated is treated as a
 * write (fail-closed for endpoints added by future plugin versions).
 */
export async function organizationBeforeHook(ctx: AuthHookContext, resolveSession: ResolveHookSession): Promise<void> {
    const path = ctx.path
    if (!path?.startsWith("/organization/") || UNGATED_ORGANIZATION_PATHS.has(path)) return

    const session = asHookSession(await resolveSession())
    if (!session) return // the endpoint's session middleware answers 401

    const { twoFactorEnabled } = await assertActiveVerifiedAccount(session)
    if (path === "/organization/create") return

    // Leaving only removes the caller's own access, so it is exempt from the
    // org-level policies: blocking it would trap a member without 2FA in an org
    // that turned enforcement on, or keep a member inside a suspended org. The
    // account-level checks above (pending 2FA, banned) still apply.
    if (path === "/organization/leave") return

    const organizationId = await resolveTargetOrganizationId(ctx, session)
    if (!organizationId) return

    const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { enforce2FA: true },
    })
    if (organization?.enforce2FA && !twoFactorEnabled) {
        throw forbidden(
            "ORG_REQUIRES_2FA",
            "Your team requires two-factor authentication. Enable it in your security settings to continue.",
        )
    }

    const { suspended } = await getOrganizationSuspension(organizationId)
    if (suspended) {
        throw forbidden("ORG_SUSPENDED", "This organization has been suspended. Please contact support.")
    }
}

/**
 * Revoke a departed member's org-scoped access: their grant to the org vault
 * key (soft revocation; the persistent key-rotation flag drives the team-page
 * banner) and every org API key they created. Shared by `afterRemoveMember`
 * and the `/organization/leave` after-hook (the plugin's leave endpoint does
 * not run the member-removal hooks).
 */
export async function revokeOrganizationMemberAccess(organizationId: string, userId: string): Promise<void> {
    await prisma.$transaction([
        prisma.organizationMemberKey.deleteMany({ where: { organizationId, userId } }),
        prisma.apiKey.deleteMany({ where: { organizationId, userId } }),
        prisma.organization.update({ where: { id: organizationId }, data: { keyRotationRecommendedAt: new Date() } }),
    ])
}

export async function organizationAfterHook(ctx: AuthHookContext): Promise<void> {
    if (ctx.path !== "/organization/leave") return
    const member = ctx.context.returned
    if (!member || member instanceof Error) return
    const organizationId = stringField(member, "organizationId")
    const userId = stringField(member, "userId")
    if (!organizationId || !userId) return

    recordMemberRemoved({ actorId: userId, targetUserId: userId, organizationId, role: stringField(member, "role") ?? "member" })
    try {
        await revokeOrganizationMemberAccess(organizationId, userId)
    } catch (error) {
        logger.error("Failed to revoke org access after leave", { error, organizationId })
    }
}

// ── Two-factor ──────────────────────────────────────────────────────────────

const TWO_FACTOR_VERIFY_PATHS = new Set([
    "/two-factor/verify-totp",
    "/two-factor/verify-backup-code",
    "/two-factor/verify-otp",
])

/**
 * A session minted by a successful second-factor proof is 2FA-verified.
 * better-auth creates a fresh session both when 2FA is first enabled (verify
 * TOTP during setup) and when the sign-in challenge completes, and seeds
 * additional fields with their defaults — which would leave a user who just
 * enabled 2FA immediately locked behind the challenge.
 */
export async function twoFactorSessionAfterHook(ctx: AuthHookContext): Promise<void> {
    if (!ctx.path || !TWO_FACTOR_VERIFY_PATHS.has(ctx.path)) return
    if (ctx.context.returned instanceof Error) return
    const sessionId = stringField(field(ctx.context.newSession, "session"), "id")
    if (!sessionId) return
    await prisma.session.update({ where: { id: sessionId }, data: { twoFactorVerified: true } })
}
