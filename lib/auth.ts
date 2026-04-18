import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { twoFactor, magicLink, mcp } from "better-auth/plugins"
import { APIError } from "@better-auth/core/error"
import { prisma } from "@/lib/prisma"
import {
    sendAccountVerificationEmail,
    sendMagicLinkEmail,
    sendPasswordResetEmail,
    sendWelcomeEmail,
} from "@/lib/resend"
import { rateLimit } from "@/lib/rate-limit"
import { getVaultSchemaState } from "@/lib/vault/schema"
import { MCP_DEFAULT_SCOPE, MCP_OAUTH_SCOPES } from "@/lib/mcp/oauth-metadata"

const ACCOUNT_DELETION_PENDING_MESSAGE = "Account deletion is already in progress for this user."

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
            const vaultSchema = await getVaultSchemaState()
            const operations = []

            if (vaultSchema.dropOwnerKeys) {
                operations.push(prisma.dropOwnerKey.deleteMany({ where: { userId: user.id } }))
            }

            if (vaultSchema.userSecurity) {
                operations.push(prisma.userSecurity.deleteMany({ where: { userId: user.id } }))
            }

            if (operations.length > 0) {
                await prisma.$transaction(operations)
            }
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

    advanced: {
        ipAddress: {
            disableIpTracking: true,
        },
    },

    rateLimit: { enabled: false }, // We use our own Upstash rate limiting
})
