import { prisma } from "@/lib/prisma"
import type { User } from "@prisma/client"
import { DAY_MS } from "@/lib/constants"
import type { SubscriptionLike } from "@/lib/limits"

/**
 * User row enriched with the active/trialing subscriptions needed by the
 * synchronous limit helpers in `lib/limits`.
 */
export type UserWithSubscriptions = User & { subscriptions: SubscriptionLike[] }

export async function getUserById(id: string): Promise<UserWithSubscriptions | null> {
    return await prisma.user.findUnique({
        where: { id },
        include: {
            subscriptions: {
                where: { status: { in: ["active", "trialing"] } },
                select: {
                    status: true,
                    product: true,
                    tier: true,
                    currentPeriodEnd: true,
                },
            },
        },
    })
}

/**
 * Returns the user's email and Stripe customer ID (resolved from the canonical
 * Subscription table) for billing portal / checkout flows.
 */
export async function getUserBillingState(userId: string) {
    const [user, stripeSub] = await Promise.all([
        prisma.user.findUnique({
            where: { id: userId },
            select: { email: true },
        }),
        prisma.subscription.findFirst({
            where: {
                userId,
                provider: "stripe",
                providerCustomerId: { not: null },
            },
            orderBy: [{ status: "asc" }, { createdAt: "desc" }],
            select: { providerCustomerId: true },
        }),
    ])

    if (!user) return null

    return {
        email: user.email,
        stripeCustomerId: stripeSub?.providerCustomerId ?? null,
    }
}

export async function getUserIdByEmail(email: string) {
    return await prisma.user.findUnique({
        where: { email },
        select: { id: true },
    })
}

/**
 * Look up a user by Stripe customer ID via the canonical Subscription table.
 */
export async function getUserIdByStripeCustomerId(stripeCustomerId: string) {
    const sub = await prisma.subscription.findFirst({
        where: { provider: "stripe", providerCustomerId: stripeCustomerId },
        select: { userId: true },
        orderBy: { createdAt: "desc" },
    })
    return sub ? { id: sub.userId } : null
}

/**
 * Look up a user by Stripe subscription ID via the canonical Subscription table.
 */
export async function getUserByStripeSubscriptionId(stripeSubscriptionId: string) {
    const sub = await prisma.subscription.findUnique({
        where: { providerSubscriptionId: stripeSubscriptionId },
        select: { user: { select: { id: true, email: true } } },
    })
    return sub?.user ?? null
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
            subscriptions: { none: { status: { in: ["active", "trialing"] } } },
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
        WHERE NOT EXISTS (
            SELECT 1 FROM subscriptions s
            WHERE s."userId" = u.id
              AND s.status IN ('active', 'trialing')
          )
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

/**
 * Find crypto subscribers whose canonical subscription expires within `windowEnd`.
 * Used by the billing cron to send 14-day / 3-day renewal reminders.
 */
export async function getCryptoRenewalReminderUsers(now: Date, windowEnd: Date) {
    const subs = await prisma.subscription.findMany({
        where: {
            provider: "crypto",
            status: { in: ["active", "trialing"] },
            currentPeriodEnd: { gt: now, lte: windowEnd },
        },
        select: {
            product: true,
            tier: true,
            currentPeriodEnd: true,
            user: { select: { id: true, email: true } },
        },
    });

    // Within the grace window (DAY_MS) treat the period end as still valid.
    const cutoff = now.getTime();
    return subs
        .filter((s) => s.currentPeriodEnd && s.currentPeriodEnd.getTime() + DAY_MS > cutoff)
        .map((s) => ({
            id: s.user.id,
            email: s.user.email,
            product: s.product,
            tier: s.tier,
            currentPeriodEnd: s.currentPeriodEnd,
        }));
}
