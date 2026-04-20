
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

/**
 * Returns users whose account age falls inside a given window, for
 * scheduled drip emails.
 *
 * The window is inclusive on the lower bound and exclusive on the upper,
 * so running this daily with `[N, N+1)` days covers everyone exactly once.
 *
 * Paid users are always excluded (already converted). The optional
 * `activityGate` skips users who've already done the thing the email is
 * asking them to do — so engaged users stop getting nudges without
 * needing a separate unsubscribe flow.
 */
export async function getDripCohort(opts: {
    minAgeMs: number;
    maxAgeMs: number;
    excludeEmails: string[];
    limit: number;
    activityGate?: "aliases" | "drops" | "apiKeys";
}) {
    const { minAgeMs, maxAgeMs, excludeEmails, limit, activityGate } = opts;
    const now = Date.now();
    const upperBound = new Date(now - minAgeMs); // newer boundary
    const lowerBound = new Date(now - maxAgeMs); // older boundary

    const activityFilter =
        activityGate === "aliases" ? { aliases: { none: {} } } :
        activityGate === "drops" ? { drops: { none: {} } } :
        activityGate === "apiKeys" ? { apiKeys: { none: {} } } :
        {};

    return await prisma.user.findMany({
        where: {
            createdAt: { gte: lowerBound, lt: upperBound },
            emailVerified: true,
            banned: false,
            stripeSubscriptionId: null,
            dripUnsubscribed: false,
            email: {
                notIn: excludeEmails,
                not: { endsWith: "@anon.li" },
            },
            ...activityFilter,
        },
        select: { id: true, email: true },
        orderBy: { createdAt: "asc" },
        take: limit,
    });
}

/**
 * Returns free-tier users who are engaged enough with the product to be
 * worth upselling — either many aliases or high forward volume.
 *
 * A user is considered "heavy" if they have:
 *   - ≥ `minAliases` aliases, OR
 *   - SUM(emailsReceived) ≥ `minEmailsForwarded` across their aliases.
 *
 * Excludes: paying users, banned users, internal/review accounts, unverified accounts.
 */
export async function getHeavyFreeUsers(opts: {
    minAliases: number;
    minEmailsForwarded: number;
    excludeEmails: string[];
    createdBefore: Date;
    limit: number;
}) {
    const { minAliases, minEmailsForwarded, excludeEmails, createdBefore, limit } = opts;

    return await prisma.$queryRaw<Array<{
        id: string;
        email: string;
        aliasCount: number;
        emailsForwarded: number;
    }>>`
        SELECT u.id, u.email, COUNT(a.id)::int AS "aliasCount", COALESCE(SUM(a."emailsReceived"), 0)::int AS "emailsForwarded"
        FROM users u
        INNER JOIN aliases a ON a."userId" = u.id
        WHERE u."stripeSubscriptionId" IS NULL
          AND u.banned = false
          AND u."emailVerified" = true
          AND u."drip_unsubscribed" = false
          AND u."createdAt" < ${createdBefore}
          AND u.email NOT LIKE '%@anon.li'
          AND u.email <> ALL(${excludeEmails}::text[])
        GROUP BY u.id, u.email
        HAVING COUNT(a.id) >= ${minAliases} OR COALESCE(SUM(a."emailsReceived"), 0) >= ${minEmailsForwarded}
        ORDER BY COALESCE(SUM(a."emailsReceived"), 0) DESC, COUNT(a.id) DESC
        LIMIT ${limit}
    `;
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
