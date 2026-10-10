import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/logger"
import { getUserBillingState } from "@/lib/data/user"
import { getCryptoIntervalForStripePriceId, type CryptoInterval } from "@/lib/crypto-prices"
import { CRYPTO_NEEDS_REVIEW_STATUS } from "@/lib/crypto-payment-status"
import { createCryptoSubscription, findConflictingStripeSubscription } from "@/lib/services/subscription-sync"
import { getCryptoPeriodEnd } from "@/lib/services/crypto-subscription"
import { captureServerEvent, trackServerEvent } from "@/lib/posthog.server"

const logger = createLogger("CryptoActivation")

// Terminal statuses. A refund is the sole higher-precedence transition and may
// supersede another terminal status (most importantly `finished`).
export const CRYPTO_TERMINAL_STATUSES = ["finished", "failed", "refunded", "expired"] as const

export type ActivatableCryptoPayment = {
    id: string
    userId: string
    orderId: string
    product: string
    tier: string
    planPriceId: string
    priceAmount: number
}

/** Provider data written with the status transition. */
export type CryptoPaymentUpdate = {
    status: string
    nowPaymentId?: string
    payCurrency?: string
    payAmount?: number
    actuallyPaid?: number | null
}

export type CryptoActivationOutcome =
    | { kind: "activated"; periodEnd: Date; interval: CryptoInterval }
    | { kind: "held"; firstHold: boolean; conflict: { id: string; status: string } }
    | { kind: "skipped" }

/**
 * The billing interval is encoded in the Stripe price id stored at checkout.
 * Crypto has no recurring billing, so this is the only durable record of which
 * period length was purchased. Unknown ids fall back to yearly: every
 * pre-interval-support invoice was yearly, and over-granting beats blocking a
 * paid activation.
 */
function resolveInterval(payment: ActivatableCryptoPayment): CryptoInterval {
    const interval = getCryptoIntervalForStripePriceId(payment.planPriceId)
    if (interval) return interval
    logger.error("Unrecognized crypto planPriceId — defaulting to yearly period", undefined, {
        paymentId: payment.id,
        planPriceId: payment.planPriceId,
    })
    return "yearly"
}

/**
 * Activate a paid crypto invoice, or hold it for review when the user still
 * has a live (or dunning) Stripe subscription that a crypto plan must not
 * silently supersede. Used by the NOWPayments webhook, the daily re-check of
 * held payments, and the admin "activate held payment" action
 * (`ignoreConflict`, after support has resolved the card subscription).
 *
 * Single Serializable transaction across CryptoPayment, User, and the
 * canonical Subscription row, so concurrent activations for the same user
 * cannot both observe "no active subs". Side effects (downgrade cancel,
 * emails, analytics) run after commit and never undo the activation. Callers
 * flush PostHog.
 */
export async function activateCryptoPayment(
    payment: ActivatableCryptoPayment,
    update: CryptoPaymentUpdate,
    opts: { ignoreConflict?: boolean } = {},
): Promise<CryptoActivationOutcome> {
    const interval = resolveInterval(payment)
    const now = new Date()
    const providerData = {
        ...(update.nowPaymentId !== undefined && { nowPaymentId: update.nowPaymentId }),
        ...(update.payCurrency !== undefined && { payCurrency: update.payCurrency }),
        ...(update.payAmount !== undefined && { payAmount: update.payAmount }),
        ...(update.actuallyPaid !== undefined && { actuallyPaid: update.actuallyPaid }),
    }

    const outcome = await prisma.$transaction(async (tx): Promise<CryptoActivationOutcome> => {
        const conflict = opts.ignoreConflict ? null : await findConflictingStripeSubscription(tx, payment.userId)
        if (conflict) {
            // Only the first transition into review notifies and is tracked.
            const held = await tx.cryptoPayment.updateMany({
                where: {
                    id: payment.id,
                    status: { notIn: [...CRYPTO_TERMINAL_STATUSES, CRYPTO_NEEDS_REVIEW_STATUS] },
                },
                data: { ...providerData, status: CRYPTO_NEEDS_REVIEW_STATUS },
            })
            if (held.count > 0) return { kind: "held", firstHold: true, conflict }
            const current = await tx.cryptoPayment.findUnique({
                where: { id: payment.id },
                select: { status: true },
            })
            return current?.status === CRYPTO_NEEDS_REVIEW_STATUS
                ? { kind: "held", firstHold: false, conflict }
                : { kind: "skipped" }
        }

        // Crypto has no auto-renewal: paying again while a crypto period is
        // still running is a renewal, so the new period starts when the
        // current one ends instead of forfeiting the remainder.
        const runningCryptoSub = await tx.subscription.findFirst({
            where: {
                userId: payment.userId,
                organizationId: null,
                provider: "crypto",
                status: "active",
                providerSubscriptionId: { not: `crypto_${payment.orderId}` },
                currentPeriodEnd: { gt: now },
            },
            orderBy: { currentPeriodEnd: "desc" },
            select: { currentPeriodEnd: true },
        })
        const periodEnd = getCryptoPeriodEnd(runningCryptoSub?.currentPeriodEnd ?? now, interval)

        // Conditional transition, so a refund committed in the meantime wins and
        // a stale success event cannot reactivate it.
        const result = await tx.cryptoPayment.updateMany({
            where: {
                id: payment.id,
                status: { notIn: [...CRYPTO_TERMINAL_STATUSES] },
            },
            data: {
                ...providerData,
                status: update.status,
                periodStart: now,
                periodEnd,
            },
        })
        if (result.count === 0) return { kind: "skipped" }

        await tx.user.update({
            where: { id: payment.userId },
            data: { paymentMethod: "crypto" },
        })
        await createCryptoSubscription(
            tx, payment.userId, payment.product, payment.tier, now, periodEnd, payment.orderId, payment.planPriceId,
        )
        return { kind: "activated", periodEnd, interval }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    if (outcome.kind === "activated") {
        await postActivationSideEffects(payment, outcome.periodEnd, outcome.interval)
    } else if (outcome.kind === "held" && outcome.firstHold) {
        await postHoldSideEffects(payment, outcome.conflict)
    }
    return outcome
}

/**
 * Non-critical side effects after a successful activation. Failures here are
 * logged and never undo the committed activation.
 */
async function postActivationSideEffects(
    payment: ActivatableCryptoPayment,
    periodEnd: Date,
    interval: CryptoInterval,
): Promise<void> {
    try {
        const { BillingDowngradeService } = await import("@/lib/services/billing-downgrade")
        await BillingDowngradeService.cancelDowngrade(payment.userId)
    } catch (error) {
        logger.error("Failed to cancel downgrade after crypto activation", error)
    }

    try {
        const user = await getUserBillingState(payment.userId)
        if (user?.email) {
            const { sendCryptoPaymentConfirmationEmail } = await import("@/lib/resend")
            await sendCryptoPaymentConfirmationEmail(user.email, {
                product: payment.product,
                tier: payment.tier,
                periodEnd,
            })
        }
    } catch (emailError) {
        logger.error("Failed to send crypto confirmation email", emailError)
    }

    // Authoritative, ad-blocker-proof revenue event (server-side).
    captureServerEvent(payment.userId, "subscription_activated", {
        provider: "crypto",
        product: payment.product,
        tier: payment.tier,
        frequency: interval,
        amount: payment.priceAmount,
        billing_reason: "new",
        order_id: payment.orderId,
    })
    // Crypto-lifecycle alias so the crypto funnel (created → paid/expired) is
    // self-contained without mixing in card purchases.
    captureServerEvent(payment.userId, "crypto_invoice_paid", {
        product: payment.product,
        tier: payment.tier,
        amount: payment.priceAmount,
        order_id: payment.orderId,
    })

    logger.info("Crypto subscription activated", {
        userId: payment.userId,
        product: payment.product,
        tier: payment.tier,
        periodEnd: periodEnd.toISOString(),
    })
}

/** First transition into review: alert ops, track it, and tell the user. */
async function postHoldSideEffects(
    payment: ActivatableCryptoPayment,
    conflict: { id: string; status: string },
): Promise<void> {
    logger.error("Crypto payment received while a Stripe subscription is live — held for manual review", undefined, {
        paymentId: payment.id,
        orderId: payment.orderId,
        userId: payment.userId,
        stripeSubscriptionRowId: conflict.id,
        stripeStatus: conflict.status,
    })
    trackServerEvent(payment.userId, "purchase_failed", {
        provider: "crypto",
        product: payment.product,
        tier: payment.tier,
        amount: payment.priceAmount,
        currency: "usd",
        failure_reason: "subscription_conflict",
        order_id: payment.orderId,
    })

    try {
        const user = await getUserBillingState(payment.userId)
        if (user?.email) {
            const React = await import("react")
            const { sendEmail } = await import("@/lib/resend")
            const { CryptoPaymentReviewEmail } = await import("@/components/email/crypto-payment-review")
            await sendEmail({
                to: user.email,
                subject: "We received your crypto payment",
                react: React.createElement(CryptoPaymentReviewEmail, { product: payment.product, tier: payment.tier }),
            })
        }
    } catch (error) {
        logger.error("Failed to send crypto payment review email", error, { paymentId: payment.id })
    }
}

/**
 * Daily re-check of payments held for review: activate each one whose
 * conflicting Stripe subscription has since ended. NOWPayments sends nothing
 * after `finished`, so without this a held payment would wait forever.
 */
export async function recheckHeldCryptoPayments(limit = 50): Promise<{
    checked: number
    activated: number
    errors: number
}> {
    const held = await prisma.cryptoPayment.findMany({
        where: { status: CRYPTO_NEEDS_REVIEW_STATUS },
        select: {
            id: true,
            userId: true,
            orderId: true,
            product: true,
            tier: true,
            planPriceId: true,
            priceAmount: true,
        },
        orderBy: { updatedAt: "asc" },
        take: limit,
    })

    let activated = 0
    let errors = 0
    for (const payment of held) {
        try {
            const outcome = await activateCryptoPayment(payment, { status: "finished" })
            if (outcome.kind === "activated") activated++
        } catch (error) {
            errors++
            logger.error("Failed to re-check held crypto payment", error, { paymentId: payment.id })
        }
    }

    if (held.length > 0) {
        logger.info("Re-checked held crypto payments", { checked: held.length, activated, errors })
    }
    return { checked: held.length, activated, errors }
}
