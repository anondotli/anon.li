import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { twoFactor, magicLink, mcp, captcha, organization } from "better-auth/plugins"
import { createAuthMiddleware } from "better-auth/api"
import { APIError } from "@better-auth/core/error"
import { prisma } from "@/lib/prisma"
import {
    sendAccountVerificationEmail,
    sendMagicLinkEmail,
    sendOrganizationInvitationEmail,
    sendPasswordResetEmail,
    sendWelcomeEmail,
} from "@/lib/resend"
import { ac, roles } from "@/lib/auth-permissions"
import {
    recordInvitationSent,
    recordMemberAdded,
    recordMemberRemoved,
    recordMemberRoleChanged,
} from "@/lib/services/audit"
import { getOrgSeatLimit } from "@/lib/org-seats"
import { validateOrganizationName } from "@/lib/validations/organization"
import { rateLimit } from "@/lib/rate-limit"
import { MCP_DEFAULT_SCOPE, MCP_OAUTH_SCOPES } from "@/lib/mcp/oauth-metadata"
import { purgePersonalVaultKeysOps } from "@/lib/vault/personal-purge"

const ACCOUNT_DELETION_PENDING_MESSAGE = "Account deletion is already in progress for this user."

/**
 * The user who PERFORMED the current request, for org member-lifecycle audit
 * attribution (better-auth's member hooks expose only the affected member, not
 * the actor). Resolved from the acting session. Dynamic import breaks the
 * auth ⇄ auth-session module cycle. Returns null if it can't be resolved.
 */
async function resolveActorId(): Promise<string | null> {
    try {
        const { auth: getAppSession } = await import("@/auth")
        const session = await getAppSession()
        return session?.user?.id ?? null
    } catch {
        return null
    }
}

async function hasDeletionRequest(userId: string): Promise<boolean> {
    const request = await prisma.deletionRequest.findUnique({
        where: { userId },
        select: { id: true },
    })

    return Boolean(request)
}

export const auth = betterAuth({
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    secret: process.env.AUTH_SECRET,
    baseURL: process.env.NEXT_PUBLIC_APP_URL,

    emailAndPassword: {
        enabled: true,
        requireEmailVerification: true,
        revokeSessionsOnPasswordReset: true,
        sendResetPassword: async ({ user, url }) => {
            await sendPasswordResetEmail(user.email, url)
        },
        onPasswordReset: async ({ user }) => {
            // A reset re-derives the user's vault key, so their personal owner
            // keys and userSecurity row are unrecoverable and must be cleared.
            // Org-owned owner keys are sealed to the org vault key (not this
            // user's) and are the sole copy — purgePersonalVaultKeysOps excludes
            // them so a member's reset never bricks the team's org drops.
            await prisma.$transaction(purgePersonalVaultKeysOps(user.id))
        },
    },

    emailVerification: {
        autoSignInAfterVerification: true,
        sendOnSignIn: true,
        sendVerificationEmail: async ({ user, url }) => {
            await sendAccountVerificationEmail(user.email, url)
        },
    },

    socialProviders: {
        github: {
            clientId: process.env.AUTH_GITHUB_ID!,
            clientSecret: process.env.AUTH_GITHUB_SECRET!,
        },
        google: {
            clientId: process.env.AUTH_GOOGLE_ID!,
            clientSecret: process.env.AUTH_GOOGLE_SECRET!,
        },
    },

    plugins: [
        magicLink({
            sendMagicLink: async ({ email, url }) => {
                const { host } = new URL(url)
                await sendMagicLinkEmail(email, url, host)
            },
        }),
        captcha({
            provider: "cloudflare-turnstile",
            secretKey: process.env.TURNSTILE_SECRET_KEY!,
            endpoints: ["/sign-in/magic-link"],
        }),
        twoFactor({
            issuer: "anon.li",
            backupCodeOptions: { amount: 8, length: 16, storeBackupCodes: "encrypted" },
        }),
        mcp({
            // Unauthenticated authorize requests land here so the user can sign in
            // (and complete 2FA if enabled) before the consent screen.
            loginPage: "/login",
            oidcConfig: {
                loginPage: "/login",
                accessTokenExpiresIn: 60 * 60, // 1 hour
                refreshTokenExpiresIn: 60 * 60 * 24 * 14, // 14 days
                defaultScope: MCP_DEFAULT_SCOPE,
                allowDynamicClientRegistration: true,
                consentPage: "/oauth/consent",
                scopes: [...MCP_OAUTH_SCOPES],
            },
        }),
        organization({
            ac,
            roles,
            creatorRole: "owner",
            // Seat enforcement: a member can't be added beyond the org's paid seats.
            membershipLimit: (_user, org) => getOrgSeatLimit(org.id),
            sendInvitationEmail: async (data) => {
                const url = `${process.env.NEXT_PUBLIC_APP_URL}/accept-invitation/${data.id}`
                const inviterName = data.inviter.user.name || data.inviter.user.email
                await sendOrganizationInvitationEmail(data.email, url, data.organization.name, inviterName)
            },
            // Populate the org audit trail for member lifecycle events. These run
            // server-side so they can't be bypassed by direct authClient calls.
            // The acting admin is resolved from the session (resolveActorId), with
            // the affected member as the target; on self-accept actor == target.
            organizationHooks: {
                // Validate team names server-side (they're rendered into invitation
                // emails — reject auto-linkable/control-char phishing payloads).
                beforeCreateOrganization: async ({ organization }) => {
                    const result = validateOrganizationName(organization.name)
                    if (result.error || !result.name) {
                        throw APIError.from("BAD_REQUEST", { message: result.error ?? "Invalid team name", code: "INVALID_ORG_NAME" })
                    }
                    return { data: { ...organization, name: result.name } }
                },
                beforeUpdateOrganization: async ({ organization }) => {
                    if (organization.name !== undefined) {
                        const result = validateOrganizationName(organization.name)
                        if (result.error || !result.name) {
                            throw APIError.from("BAD_REQUEST", { message: result.error ?? "Invalid team name", code: "INVALID_ORG_NAME" })
                        }
                        return { data: { ...organization, name: result.name } }
                    }
                },
                afterAddMember: async ({ member, organization }) => {
                    const actorId = (await resolveActorId()) ?? member.userId
                    recordMemberAdded({ actorId, targetUserId: member.userId, organizationId: organization.id, role: member.role })
                },
                afterRemoveMember: async ({ member, organization }) => {
                    const actorId = (await resolveActorId()) ?? member.userId
                    recordMemberRemoved({ actorId, targetUserId: member.userId, organizationId: organization.id, role: member.role })
                    // Revoke the removed member's grant to the org vault key so the
                    // owner-key endpoints stop serving it to them (soft revocation),
                    // and persistently flag that a key rotation is recommended (full
                    // forward secrecy needs an admin to rotate, since the removed
                    // member could have cached the key). The team page reads
                    // keyRotationRecommendedAt to show the banner across refreshes;
                    // a successful rotation clears it.
                    void prisma.organizationMemberKey
                        .deleteMany({ where: { organizationId: organization.id, userId: member.userId } })
                        .catch(() => {})
                    void prisma.organization
                        .update({ where: { id: organization.id }, data: { keyRotationRecommendedAt: new Date() } })
                        .catch(() => {})
                },
                afterUpdateMemberRole: async ({ member, previousRole, organization }) => {
                    const actorId = (await resolveActorId()) ?? member.userId
                    recordMemberRoleChanged({
                        actorId,
                        targetUserId: member.userId,
                        organizationId: organization.id,
                        from: previousRole,
                        to: member.role,
                    })
                },
                afterCreateInvitation: async ({ invitation, inviter, organization }) => {
                    recordInvitationSent({
                        inviterId: inviter.id,
                        organizationId: organization.id,
                        email: invitation.email,
                        role: invitation.role,
                    })
                },
                beforeDeleteOrganization: async ({ organization }) => {
                    // Erase org-owned Drop blobs from R2 BEFORE the delete cascade
                    // removes the drop rows (afterDelete would lose the storage
                    // keys). Best-effort: failed keys are tracked as orphaned files
                    // for cron retry — never block org deletion on storage.
                    try {
                        const { eraseOrgDrops } = await import("@/lib/services/erasure")
                        await eraseOrgDrops(organization.id)
                    } catch {
                        // Swallow; deletion proceeds, cron reaps any orphaned blobs.
                    }
                },
            },
        }),
    ],

    session: {
        additionalFields: {
            twoFactorVerified: { type: "boolean", defaultValue: false, input: false },
        },
    },

    user: {
        additionalFields: {
            isAdmin: { type: "boolean", defaultValue: false, input: false },
            banned: { type: "boolean", defaultValue: false, input: false },
            banAliasCreation: { type: "boolean", defaultValue: false, input: false },
            banFileUpload: { type: "boolean", defaultValue: false, input: false },
        },
    },

    databaseHooks: {
        account: {
            create: {
                before: async (account) => {
                    if (await hasDeletionRequest(account.userId)) {
                        throw APIError.from("FORBIDDEN", {
                            message: ACCOUNT_DELETION_PENDING_MESSAGE,
                            code: "ACCOUNT_DELETION_PENDING",
                        })
                    }
                },
            },
        },
        session: {
            create: {
                before: async (session) => {
                    if (await hasDeletionRequest(session.userId)) {
                        throw APIError.from("FORBIDDEN", {
                            message: ACCOUNT_DELETION_PENDING_MESSAGE,
                            code: "ACCOUNT_DELETION_PENDING",
                        })
                    }
                },
            },
        },
        user: {
            create: {
                before: async (user) => {
                    // Rate limit sign-ups
                    const ipLimit = await rateLimit("loginRegister")
                    if (ipLimit) {
                        return false
                    }
                    if (user.email) {
                        const emailLimit = await rateLimit("loginRegister", user.email)
                        if (emailLimit) {
                            return false
                        }
                    }
                    return undefined
                },
                after: async (user) => {
                    if (user.email) await sendWelcomeEmail(user.email)
                },
            },
        },
    },

    hooks: {
        // Brute-force protection applied to every entry into better-auth, including
        // direct HTTP requests to the [...all] handler AND in-process auth.api.*
        // calls (both dispatch through this before-hook). better-auth's built-in
        // limiter is disabled (rateLimit.enabled = false) and the Turnstile captcha
        // only covers /sign-in/magic-link, so these endpoints would otherwise be
        // unthrottled password / one-time-code oracles.
        before: createAuthMiddleware(async (ctx) => {
            const tooManyRequests = (code: string) =>
                APIError.from("TOO_MANY_REQUESTS", {
                    message: "Too many attempts. Please try again later.",
                    code,
                })

            // Credential sign-in: throttle by client IP and by submitted email
            // (mirrors the sign-up guard in databaseHooks.user.create).
            if (ctx.path === "/sign-in/email") {
                if (await rateLimit("signIn")) {
                    throw tooManyRequests("SIGN_IN_RATE_LIMITED")
                }
                const rawEmail = (ctx.body as { email?: unknown } | undefined)?.email
                if (typeof rawEmail === "string" && rawEmail.length > 0) {
                    if (await rateLimit("signIn", `email:${rawEmail.toLowerCase()}`)) {
                        throw tooManyRequests("SIGN_IN_RATE_LIMITED")
                    }
                }
                return
            }

            // 2FA verification: a per-IP ceiling that an attacker cannot reset by
            // rotating the pending-2FA cookie. Covers the direct REST endpoints and
            // the server-action path (actions/two-factor.ts calls auth.api.verifyTOTP).
            if (ctx.path === "/two-factor/verify-totp" || ctx.path === "/two-factor/verify-backup-code") {
                if (await rateLimit("twoFactorVerifyIp")) {
                    throw tooManyRequests("TWO_FACTOR_RATE_LIMITED")
                }
            }
        }),
    },

    advanced: {
        ipAddress: {
            disableIpTracking: true,
        },
    },

    rateLimit: { enabled: false }, // We use our own Upstash rate limiting
})
