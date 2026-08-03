import { NextResponse, after } from "next/server"
import { getUserBillingState } from "@/lib/data/user"
import { prisma } from "@/lib/prisma"
import { NOWPaymentsClient } from "@/lib/nowpayments"
import { Redis } from "@upstash/redis"
import { createLogger } from "@/lib/logger"
import { isValidCryptoProduct, isValidCryptoTier } from "@/lib/crypto-prices"
import { createCryptoSubscription } from "@/lib/services/subscription-sync"
import { captureServerEvent, flushPostHog, trackServerEvent } from "@/lib/posthog.server"
import { Prisma } from "@prisma/client"
import { isNowPaymentsPaymentStatus } from "@/lib/crypto-payment-status"

const logger = createLogger("NOWPaymentsWebhook")

// Lazy Redis initialization (mirrors Stripe webhook pattern)
let redis: Redis | null = null
function getRedis(): Redis {
    if (redis) return redis
    redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
    return redis
}

// Terminal statuses. A refund is the sole higher-precedence transition and may
// supersede another terminal status (most importantly `finished`).
const TERMINAL_STATUSES = new Set(["finished", "failed", "refunded", "expired"])

// Statuses that indicate successful payment
const SUCCESS_STATUSES = new Set(["finished", "confirmed", "sending"])

/**
 * Atomically try to claim an IPN event+status for processing using SET NX.
 * Uses a short TTL (5 minutes) so crashes allow retries.
 */
async function tryClaimIPN(paymentId: string, status: string): Promise<boolean> {
    const redisClient = getRedis()
    const key = `nowpay:ipn:${paymentId}:${status}`
    const claimed = await redisClient.set(key, "processing", { nx: true, ex: 300 })
    return claimed !== null
}

/**
 * Mark an IPN event+status as permanently processed (7-day TTL).
 */
async function markIPNProcessed(paymentId: string, status: string): Promise<void> {
    const redisClient = getRedis()
    const key = `nowpay:ipn:${paymentId}:${status}`
    await redisClient.set(key, "done", { ex: 86400 * 7 })
}

/**
 * Release claim on an IPN so it can be retried.
 */
async function releaseIPNClaim(paymentId: string, status: string): Promise<void> {
    const redisClient = getRedis()
    const key = `nowpay:ipn:${paymentId}:${status}`
    await redisClient.del(key)
}

/**
 * Validate that product/tier are recognized crypto plan values.
 * Returns false and logs if invalid.
 */
function validateCryptoProductTier(product: string, tier: string, paymentId: string): boolean {
    if (!isValidCryptoProduct(product) || !isValidCryptoTier(tier)) {
        logger.error("Invalid product/tier in crypto payment", undefined, {
            paymentId,
            product,
            tier,
        })
        return false
    }
    return true
}

/**
 * Non-critical side effects after successful crypto subscription activation.
 * Called outside the DB transaction — failures here don't block activation.
 */
async function postActivationSideEffects(
    payment: { id: string; userId: string; product: string; tier: string; planPriceId: string; priceAmount: number },
    periodEnd: Date,
    orderId: string,
): Promise<void> {
    // Cancel any active downgrade
    try {
        const { BillingDowngradeService } = await import("@/lib/services/billing-downgrade")
        await BillingDowngradeService.cancelDowngrade(payment.userId)
    } catch (error) {
        logger.error("Failed to cancel downgrade after crypto activation", error)
    }

    // Send confirmation email
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
        frequency: "yearly",
        amount: payment.priceAmount,
        billing_reason: "new",
        order_id: orderId,
    })
    // Crypto-lifecycle alias so the crypto funnel (created → paid/expired) is
    // self-contained without mixing in card purchases.
    captureServerEvent(payment.userId, "crypto_invoice_paid", {
        product: payment.product,
        tier: payment.tier,
        amount: payment.priceAmount,
        order_id: orderId,
    })
    after(() => flushPostHog())

    logger.info("Crypto subscription activated", {
        userId: payment.userId,
        product: payment.product,
        tier: payment.tier,
        periodEnd: periodEnd.toISOString(),
    })
}

export async function POST(req: Request) {
    let body: Record<string, unknown>
    try {
        body = await req.json()
    } catch {
        return new NextResponse("Invalid JSON", { status: 400 })
    }

    // Verify IPN signature
    const signature = req.headers.get("x-nowpayments-sig")
    if (!signature || !NOWPaymentsClient.verifyIPNSignature(body, signature)) {
        logger.error("IPN signature verification failed")
        return new NextResponse("Invalid signature", { status: 400 })
    }

    const paymentId = typeof body.payment_id === "string" || typeof body.payment_id === "number"
        ? String(body.payment_id)
        : ""
    const paymentStatus = body.payment_status
    const orderId = typeof body.order_id === "string" ? body.order_id : ""

    if (!paymentId || !isNowPaymentsPaymentStatus(paymentStatus) || !orderId) {
        logger.error("Missing required IPN fields", undefined, { paymentId, paymentStatus, orderId })
        return new NextResponse(null, { status: 200 })
    }

    // Atomically claim the IPN — prevents duplicate processing across workers
    if (!(await tryClaimIPN(paymentId, paymentStatus))) {
        logger.info("Skipping already claimed/processed IPN", { paymentId, paymentStatus })
        return new NextResponse(null, { status: 200 })
    }

    try {
        // Look up payment record
        const payment = await prisma.cryptoPayment.findUnique({
            where: { orderId },
        })

        if (!payment) {
            logger.error("CryptoPayment not found for orderId", undefined, { orderId })
            await markIPNProcessed(paymentId, paymentStatus)
            return new NextResponse(null, { status: 200 })
        }

        // This integration creates NOWPayments invoices, so every callback must
        // remain bound to the immutable invoice id returned at checkout. Payment
        // ids may legitimately change for repeated deposits, but the invoice id
        // does not. `order_id` alone is merchant-controlled metadata and is not a
        // sufficient financial ownership check.
        const incomingInvoiceId = body.invoice_id == null ? "" : String(body.invoice_id)
        if (incomingInvoiceId !== payment.invoiceId) {
            logger.error("NOWPayments invoice binding mismatch", undefined, {
                orderId,
                expectedInvoiceId: payment.invoiceId,
                incomingInvoiceId,
            })
            await markIPNProcessed(paymentId, paymentStatus)
            return new NextResponse(null, { status: 200 })
        }

        // A refund is the highest-precedence terminal state: NOWPayments may send
        // it after `finished`, and it must revoke an entitlement that was already
        // granted. Every other event remains unable to overwrite a terminal state,
        // so delayed success notifications cannot restore a refunded purchase.
        const isRefund = paymentStatus === "refunded"
        if (TERMINAL_STATUSES.has(payment.status) && !isRefund) {
            logger.info("Skipping IPN for terminal status", {
                orderId,
                currentStatus: payment.status,
                newStatus: paymentStatus,
            })
            await markIPNProcessed(paymentId, paymentStatus)
            return new NextResponse(null, { status: 200 })
        }

        const previousStatus = payment.status
        const shouldActivate = SUCCESS_STATUSES.has(paymentStatus) && !SUCCESS_STATUSES.has(previousStatus)
            && validateCryptoProductTier(payment.product, payment.tier, payment.id)

        if (isRefund) {
            const refundedAt = new Date()

            // Keep the payment state and its canonical entitlement in the same
            // transaction. updateMany makes this idempotent for legacy/refund
            // replays where the subscription row may already be absent.
            await prisma.$transaction(async (tx) => {
                await tx.cryptoPayment.update({
                    where: { id: payment.id },
                    data: {
                        nowPaymentId: paymentId,
                        status: "refunded",
                        payCurrency: String(body.pay_currency ?? payment.payCurrency),
                        payAmount: Number(body.pay_amount ?? payment.payAmount),
                        actuallyPaid: body.actually_paid != null ? Number(body.actually_paid) : payment.actuallyPaid,
                    },
                })
                await tx.subscription.updateMany({
                    where: { providerSubscriptionId: `crypto_${orderId}` },
                    data: {
                        status: "canceled",
                        currentPeriodEnd: refundedAt,
                        cancelAtPeriodEnd: false,
                    },
                })
            }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

            // Revenue instrumentation: a refund revokes the entitlement.
            trackServerEvent(payment.userId, "subscription_canceled", {
                provider: "crypto",
                product: payment.product,
                tier: payment.tier,
                cancel_reason: "refunded",
                order_id: orderId,
            })
        }

        // Validate payment amount before activation
        if (!isRefund && shouldActivate) {
            // The stored invoice amount is the immutable checkout contract.
            // Comparing against today's pricing would incorrectly reject an
            // invoice after a legitimate catalog price change.
            const incomingPriceAmount = Number(body.price_amount)
            const incomingPriceCurrency = String(body.price_currency ?? "").toLowerCase()
            if (
                !Number.isFinite(incomingPriceAmount)
                || Math.abs(payment.priceAmount - incomingPriceAmount) > 0.50
                || incomingPriceCurrency !== payment.priceCurrency.toLowerCase()
            ) {
                logger.error("Crypto IPN invoice amount does not match checkout — blocking activation", undefined, {
                    paymentId: payment.id,
                    storedAmount: payment.priceAmount,
                    incomingAmount: incomingPriceAmount,
                    storedCurrency: payment.priceCurrency,
                    incomingCurrency: incomingPriceCurrency,
                })
                // Price mismatch is permanent — update status but don't activate
                await prisma.cryptoPayment.updateMany({
                    where: {
                        id: payment.id,
                        status: { notIn: [...TERMINAL_STATUSES] },
                    },
                    data: {
                        nowPaymentId: paymentId,
                        status: "price_mismatch",
                    },
                })
                trackServerEvent(payment.userId, "purchase_failed", {
                    provider: "crypto",
                    product: payment.product,
                    tier: payment.tier,
                    amount: payment.priceAmount,
                    currency: "usd",
                    failure_reason: "price_mismatch",
                    order_id: orderId,
                })
                await markIPNProcessed(paymentId, paymentStatus)
                return new NextResponse(null, { status: 200 })
            }
            const actuallyPaid = Number(body.actually_paid)
            const payAmount = Number(body.pay_amount)
            if (
                !Number.isFinite(actuallyPaid)
                || !Number.isFinite(payAmount)
                || actuallyPaid <= 0
                || payAmount <= 0
            ) {
                logger.error("Crypto success IPN omitted valid payment amounts — blocking activation", undefined, {
                    paymentId: payment.id,
                    actuallyPaid,
                    payAmount,
                })
                // A signed but incomplete provider payload should be retried;
                // entitlement activation always fails closed.
                await releaseIPNClaim(paymentId, paymentStatus)
                return new NextResponse(null, { status: 500 })
            }
            if (actuallyPaid < payAmount * 0.95) {
                logger.error("Crypto payment underpaid — blocking activation", undefined, {
                    paymentId: payment.id, actuallyPaid, payAmount,
                })
                // Underpayment is permanent — update status but don't activate
                await prisma.cryptoPayment.updateMany({
                    where: {
                        id: payment.id,
                        status: { notIn: [...TERMINAL_STATUSES] },
                    },
                    data: {
                        nowPaymentId: paymentId,
                        status: "underpaid",
                        actuallyPaid: actuallyPaid,
                        payAmount: payAmount,
                    },
                })
                trackServerEvent(payment.userId, "purchase_failed", {
                    provider: "crypto",
                    product: payment.product,
                    tier: payment.tier,
                    amount: payment.priceAmount,
                    currency: "usd",
                    failure_reason: "underpaid",
                    order_id: orderId,
                })
                await markIPNProcessed(paymentId, paymentStatus)
                return new NextResponse(null, { status: 200 })
            }
        }

        // Update payment record with IPN data + activate subscription atomically
        if (!isRefund && shouldActivate) {
            const now = new Date()
            const periodEnd = new Date(now)
            periodEnd.setFullYear(periodEnd.getFullYear() + 1)

            // Single Serializable transaction across CryptoPayment, User, and the
            // canonical Subscription row. Serializable isolation is required so
            // concurrent IPNs for the same user (e.g. the user paid two crypto
            // invoices) cannot both observe "no active subs" and end up creating
            // two simultaneously-active rows. Postgres aborts the loser; the
            // released claim lets NOWPayments retry and the synthetic-id upsert
            // is then a no-op idempotent update.
            const didActivate = await prisma.$transaction(async (tx) => {
                // The initial lookup happens before the transaction. Make the
                // transition conditional here as well, so a refund committed in
                // the meantime wins and a stale success event cannot reactivate it.
                const result = await tx.cryptoPayment.updateMany({
                    where: {
                        id: payment.id,
                        status: { notIn: [...TERMINAL_STATUSES] },
                    },
                    data: {
                        nowPaymentId: paymentId,
                        status: paymentStatus,
                        payCurrency: String(body.pay_currency ?? payment.payCurrency),
                        payAmount: Number(body.pay_amount ?? payment.payAmount),
                        actuallyPaid: body.actually_paid != null ? Number(body.actually_paid) : payment.actuallyPaid,
                        periodStart: now,
                        periodEnd: periodEnd,
                    },
                })
                if (result.count === 0) return false

                await tx.user.update({
                    where: { id: payment.userId },
                    data: {
                        paymentMethod: "crypto",
                    },
                })
                await createCryptoSubscription(tx, payment.userId, payment.product, payment.tier, now, periodEnd, orderId)
                return true
            }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

            // Non-critical side effects outside transaction
            if (didActivate) {
                await postActivationSideEffects(payment, periodEnd, orderId)
            }
        } else if (!isRefund) {
            // Non-activation status update
            // The terminal-state predicate makes this write safe against a refund
            // that commits after the initial lookup but before this update.
            await prisma.cryptoPayment.updateMany({
                where: {
                    id: payment.id,
                    status: { notIn: [...TERMINAL_STATUSES] },
                },
                data: {
                    nowPaymentId: paymentId,
                    status: paymentStatus,
                    payCurrency: String(body.pay_currency ?? payment.payCurrency),
                    payAmount: Number(body.pay_amount ?? payment.payAmount),
                    actuallyPaid: body.actually_paid != null ? Number(body.actually_paid) : payment.actuallyPaid,
                },
            })

            // Revenue instrumentation for terminal failure statuses. Intermediate
            // statuses (waiting/confirming) emit nothing.
            if (paymentStatus === "expired") {
                trackServerEvent(payment.userId, "crypto_invoice_expired", {
                    product: payment.product,
                    tier: payment.tier,
                    amount: payment.priceAmount,
                    order_id: orderId,
                    source: "webhook",
                })
            } else if (paymentStatus === "failed") {
                trackServerEvent(payment.userId, "purchase_failed", {
                    provider: "crypto",
                    product: payment.product,
                    tier: payment.tier,
                    amount: payment.priceAmount,
                    currency: "usd",
                    failure_reason: "failed",
                    order_id: orderId,
                })
            }
        }
    } catch (error) {
        logger.error("IPN handler failed", error, { paymentId, paymentStatus, orderId })
        // Release claim so NOWPayments retry can re-process
        await releaseIPNClaim(paymentId, paymentStatus)
        return new NextResponse(null, { status: 500 })
    }

    // Mark as permanently processed after successful completion
    await markIPNProcessed(paymentId, paymentStatus)

    return new NextResponse(null, { status: 200 })
}
