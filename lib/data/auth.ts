import { prisma } from "@/lib/prisma"
import type { SubscriptionLike } from "@/lib/limits"

interface AuthUserState {
    id: string
    isAdmin: boolean
    banned: boolean
    twoFactorEnabled: boolean
    subscriptions: SubscriptionLike[]
}

interface AuthApiKeyRecord {
    id: string
    user: Pick<AuthUserState, "id" | "banned" | "subscriptions">
}

const ACTIVE_SUBSCRIPTION_SELECT = {
    where: { status: { in: ["active", "trialing"] } },
    select: {
        status: true,
        product: true,
        tier: true,
        currentPeriodEnd: true,
    },
}

export async function getAuthUserState(userId: string): Promise<AuthUserState | null> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            isAdmin: true,
            banned: true,
            twoFactorEnabled: true,
            subscriptions: ACTIVE_SUBSCRIPTION_SELECT,
            deletionRequest: {
                select: { id: true },
            },
        },
    })

    if (!user || user.deletionRequest) {
        return null
    }

    const { deletionRequest: _deletionRequest, ...authUser } = user
    return authUser
}

export async function getAuthApiKeyRecord(keyHash: string): Promise<(AuthApiKeyRecord & { expiresAt: Date | null }) | null> {
    const apiKey = await prisma.apiKey.findUnique({
        where: { keyHash },
        select: {
            id: true,
            expiresAt: true,
            user: {
                select: {
                    id: true,
                    banned: true,
                    subscriptions: ACTIVE_SUBSCRIPTION_SELECT,
                    deletionRequest: {
                        select: { id: true },
                    },
                },
            },
        },
    })

    if (!apiKey || apiKey.user.deletionRequest) {
        return null
    }

    const { deletionRequest: _deletionRequest, ...user } = apiKey.user
    return {
        ...apiKey,
        user,
    }
}

export async function touchApiKeyLastUsed(apiKeyId: string): Promise<void> {
    await prisma.apiKey.update({
        where: { id: apiKeyId },
        data: { lastUsedAt: new Date() },
    })
}
