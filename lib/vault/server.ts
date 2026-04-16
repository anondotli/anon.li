import { createHmac } from "node:crypto"
import { headers } from "next/headers"
import { hashPassword, verifyPassword } from "better-auth/crypto"
import { auth as betterAuth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const VAULT_KDF_VERSION = 1
const DEFAULT_FRESH_SESSION_AGE_MS = 4 * 60 * 60 * 1000

interface VaultSessionResult {
    session: {
        id: string
        createdAt: Date | string
        twoFactorVerified?: boolean | null
    }
    user: {
        id: string
        email: string
        name?: string | null
        twoFactorEnabled?: boolean | null
    }
}

function encodeBase64Url(buffer: Uint8Array): string {
    return Buffer.from(buffer).toString("base64url")
}

export function normalizeEmail(email: string): string {
    return email.trim().toLowerCase()
}

export function createFakeAuthSalt(email: string): string {
    const digest = createHmac("sha256", process.env.AUTH_SECRET!)
        .update("vault-bootstrap:")
        .update(normalizeEmail(email))
        .digest()

    return encodeBase64Url(digest)
}

export async function getVaultSession(options?: {
    require2FA?: boolean
    fresh?: boolean
}): Promise<VaultSessionResult | null> {
    const result = await betterAuth.api.getSession({ headers: await headers() })
    if (!result?.session || !result?.user?.id || !result.user.email) {
        return null
    }

    if ((options?.require2FA ?? true) && result.user.twoFactorEnabled && !result.session.twoFactorVerified) {
        return null
    }

    if (options?.fresh) {
        const createdAt = new Date(result.session.createdAt).getTime()
        if (!Number.isFinite(createdAt) || Date.now() - createdAt >= DEFAULT_FRESH_SESSION_AGE_MS) {
            return null
        }
    }

    return result as VaultSessionResult
}

export async function getCredentialAccount(userId: string) {
    return prisma.account.findFirst({
        where: {
            userId,
            providerId: "credential",
        },
    })
}

export async function hashCredentialSecret(secret: string): Promise<string> {
    return hashPassword(secret)
}

export async function verifyCredentialSecret(userId: string, secret: string): Promise<boolean> {
    const account = await getCredentialAccount(userId)
    if (!account?.password) {
        return false
    }

    return verifyPassword({
        hash: account.password,
        password: secret,
    })
}
