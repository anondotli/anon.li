
import { prisma } from "@/lib/prisma"
import type { User } from "@prisma/client"

type UserSubscriptionState = {
    stripePriceId: string | null
    stripeCurrentPeriodEnd: Date | null
    stripeCancelAtPeriodEnd: boolean
}

export async function getUserById(id: string): Promise<User | null> {
    return await prisma.user.findUnique({
        where: { id },
    })
}

export async function getUserBillingState(userId: string) {
    return await prisma.user.findUnique({
        where: { id: userId },
        select: {
            email: true,
            stripeCustomerId: true,
            stripePriceId: true,
            stripeCurrentPeriodEnd: true,
        },
    })
}

export async function getUserIdByEmail(email: string) {
    return await prisma.user.findUnique({
        where: { email },
        select: { id: true },
    })
}

export async function getUserIdByStripeCustomerId(stripeCustomerId: string) {
    return await prisma.user.findUnique({
        where: { stripeCustomerId },
        select: { id: true },
    })
}

export async function getUserByStripeSubscriptionId(stripeSubscriptionId: string) {
    return await prisma.user.findUnique({
        where: { stripeSubscriptionId },
        select: { id: true, email: true },
    })
}

export async function getUserSubscriptionSyncState(userId: string) {
    return await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            stripeSubscriptionId: true,
            stripeCustomerId: true,
        },
    })
}

export async function updateUserSubscriptionStateById(
    userId: string,
    data: Partial<UserSubscriptionState> & {
        stripeSubscriptionId?: string | null
        stripeCustomerId?: string | null
        paymentMethod?: string
    }
) {
    return await prisma.user.update({
        where: { id: userId },
        data,
    })
}

export async function updateUserSubscriptionStateBySubscriptionId(
    stripeSubscriptionId: string,
    data: UserSubscriptionState
) {
    return await prisma.user.update({
        where: { stripeSubscriptionId },
        data,
    })
}

export async function clearUserSubscriptionState(userId: string) {
    return await prisma.user.update({
        where: { id: userId },
        data: {
            stripePriceId: null,
            stripeSubscriptionId: null,
            stripeCancelAtPeriodEnd: false,
        },
    })
}

export async function getCryptoRenewalReminderUsers(now: Date, fourteenDaysOut: Date) {
    return await prisma.user.findMany({
        where: {
            paymentMethod: "crypto",
            stripePriceId: { not: null },
            stripeCurrentPeriodEnd: {
                gt: now,
                lte: fourteenDaysOut,
            },
        },
        select: {
            id: true,
            email: true,
            stripePriceId: true,
            stripeCurrentPeriodEnd: true,
        },
    })
}
