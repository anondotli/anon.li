import "server-only"

import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/logger"
import { DAY_MS } from "@/lib/constants"
import type { CryptoInterval } from "@/lib/crypto-prices"

const logger = createLogger("CryptoSubscription")

/**
 * Add whole calendar months, clamping to the last day of the target month so a
 * period starting Jan 31 ends Feb 28/29 instead of overflowing into March.
 */
export function addMonthsClamped(date: Date, months: number): Date {
    const result = new Date(date)
    const day = result.getUTCDate()
    result.setUTCDate(1)
    result.setUTCMonth(result.getUTCMonth() + months)
    const lastDayOfTargetMonth = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate()
    result.setUTCDate(Math.min(day, lastDayOfTargetMonth))
    return result
}

/**
 * End of a prepaid crypto period starting at `start`. Yearly periods reuse the
 * month clamp so Feb 29 maps to Feb 28 in non-leap years.
 */
export function getCryptoPeriodEnd(start: Date, interval: CryptoInterval): Date {
    return addMonthsClamped(start, interval === "monthly" ? 1 : 12)
}

/**
 * Crypto subscriptions are prepaid and never renew on their own, so nothing
 * from the provider ever ends them. Transition rows still marked active once
 * their period (plus the same one-day access grace the entitlement checks use)
 * has lapsed, and apply the personal subscription-loss side effects.
 *
 * The status transition is guarded (`status: "active"`), so concurrent runs or
 * a renewal committed in between never double-apply the loss.
 */
export async function expireLapsedCryptoSubscriptions(limit = 100): Promise<{
    expired: number
    downgraded: number
    errors: number
}> {
    const cutoff = new Date(Date.now() - DAY_MS)
    const lapsed = await prisma.subscription.findMany({
        where: {
            provider: "crypto",
            status: "active",
            currentPeriodEnd: { lt: cutoff },
        },
        select: {
            id: true,
            userId: true,
            organizationId: true,
            user: { select: { email: true } },
        },
        orderBy: { currentPeriodEnd: "asc" },
        take: limit,
    })

    let expired = 0
    let downgraded = 0
    let errors = 0

    for (const row of lapsed) {
        try {
            const result = await prisma.subscription.updateMany({
                where: { id: row.id, status: "active" },
                data: { status: "expired", cancelAtPeriodEnd: false },
            })
            if (result.count === 0) continue
            expired++

            if (row.organizationId || !row.userId) continue
            try {
                if (await handleCryptoSubscriptionLoss(row.userId, row.user?.email ?? null)) {
                    downgraded++
                }
            } catch (error) {
                // Undo the transition so the next run retries the loss side
                // effects (they are idempotent; the email only goes out once
                // they all succeed). The lapsed row grants nothing meanwhile:
                // entitlement checks already ignore it past currentPeriodEnd.
                expired--
                await prisma.subscription.updateMany({
                    where: { id: row.id, status: "expired" },
                    data: { status: "active" },
                })
                throw error
            }
        } catch (error) {
            errors++
            logger.error("Failed to expire lapsed crypto subscription", error, { subscriptionId: row.id })
        }
    }

    if (lapsed.length > 0) {
        logger.info("Expired lapsed crypto subscriptions", { expired, downgraded, errors })
    }

    return { expired, downgraded, errors }
}

/**
 * Personal-loss side effects for a crypto subscription that ended (period
 * lapse or refund). Skipped when the user still holds another entitling
 * personal subscription. Returns whether the downgrade was applied.
 */
export async function handleCryptoSubscriptionLoss(userId: string, email: string | null): Promise<boolean> {
    const { BillingDowngradeService } = await import("@/lib/services/billing-downgrade")
    if (await BillingDowngradeService.hasActivePersonalSubscription(userId)) {
        logger.info("Skipping crypto downgrade side effects; user retains another active subscription", { userId })
        return false
    }
    await BillingDowngradeService.handlePersonalSubscriptionLoss(userId, email, { notify: true })
    return true
}
