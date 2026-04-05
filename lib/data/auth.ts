import { prisma } from "@/lib/prisma"

interface AuthUserState {
    id: string
    isAdmin: boolean
    banned: boolean
    stripeSubscriptionId: string | null
    stripePriceId: string | null
    stripeCurrentPeriodEnd: Date | null
}

interface AuthApiKeyRecord {
    id: string
    user: Pick<
        AuthUserState,
        "id" | "banned" | "stripeSubscriptionId" | "stripePriceId" | "stripeCurrentPeriodEnd"
    >
}

export async function getAuthUserState(userId: string): Promise<AuthUserState | null> {
    return await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            isAdmin: true,
            banned: true,
            stripeSubscriptionId: true,
            stripePriceId: true,
            stripeCurrentPeriodEnd: true,
        },
    })
}

export async function getAuthApiKeyRecord(keyHash: string): Promise<(AuthApiKeyRecord & { expiresAt: Date | null }) | null> {
    return await prisma.apiKey.findUnique({
        where: { keyHash },
        select: {
            id: true,
            expiresAt: true,
            user: {
                select: {
                    id: true,
                    banned: true,
                    stripeSubscriptionId: true,
                    stripePriceId: true,
                    stripeCurrentPeriodEnd: true,
                },
            },
        },
    })
}

export async function touchApiKeyLastUsed(apiKeyId: string): Promise<void> {
    await prisma.apiKey.update({
        where: { id: apiKeyId },
        data: { lastUsedAt: new Date() },
    })
}
