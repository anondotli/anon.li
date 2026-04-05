import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { twoFactor, magicLink } from "better-auth/plugins"
import { prisma } from "@/lib/prisma"
import { sendMagicLinkEmail, sendWelcomeEmail } from "@/lib/resend"
import { rateLimit } from "@/lib/rate-limit"

export const auth = betterAuth({
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    secret: process.env.AUTH_SECRET,
    baseURL: process.env.NEXT_PUBLIC_APP_URL,

    emailAndPassword: { enabled: false },

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
