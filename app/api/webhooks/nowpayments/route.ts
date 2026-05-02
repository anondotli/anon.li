import { NextResponse } from "next/server"
import { getUserBillingState } from "@/lib/data/user"
import { prisma } from "@/lib/prisma"
import { NOWPaymentsClient } from "@/lib/nowpayments"
import { Redis } from "@upstash/redis"
import { createLogger } from "@/lib/logger"
import { isValidCryptoProduct, isValidCryptoTier, getCryptoPrice } from "@/lib/crypto-prices"
import type { CryptoProduct, CryptoTier } from "@/lib/crypto-prices"
import { createCryptoSubscription } from "@/lib/services/subscription-sync"
import { Prisma } from "@prisma/client"

const logger = createLogger("NOWPaymentsWebhook")

// Lazy Redis initialization (mirrors Stripe webhook pattern)
let redis: Redis | null = null
function getRedis(): Redis | null {
    if (redis) return redis
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
        redis = new Redis({
            url: process.env.UPSTASH_REDIS_REST_URL,
            token: process.env.UPSTASH_REDIS_REST_TOKEN,
        })
    }
    return redis
}

// Statuses that are terminal and cannot be overwritten
const TERMINAL_STATUSES = new Set(["finished", "failed", "refunded", "expired"])

// Statuses that indicate successful payment
const SUCCESS_STATUSES = new Set(["finished", "confirmed", "sending"])

/**
 * Atomically try to claim an IPN event+status for processing using SET NX.
 * Uses a short TTL (5 minutes) so crashes allow retries.
 */
async function tryClaimIPN(paymentId: string, status: string): Promise<boolean> {
    const redisClient = getRedis()
    if (!redisClient) return true

    const key = `nowpay:ipn:${paymentId}:${status}`
    const claimed = await redisClient.set(key, "processing", { nx: true, ex: 300 })
    return claimed !== null
}

/**
 * Mark an IPN event+status as permanently processed (7-day TTL).
 */
async function markIPNProcessed(paymentId: string, status: string): Promise<void> {
    const redisClient = getRedis()
    if (!redisClient) return

    const key = `nowpay:ipn:${paymentId}:${status}`
    await redisClient.set(key, "done", { ex: 86400 * 7 })
}

/**
 * Release claim on an IPN so it can be retried.
 */
async function releaseIPNClaim(paymentId: string, status: string): Promise<void> {
    const redisClient = getRedis()
    if (!redisClient) return

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
    periodEnd: Date
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

    const paymentId = String(body.payment_id ?? "")
    const paymentStatus = String(body.payment_status ?? "")
    const orderId = String(body.order_id ?? "")

    if (!paymentId || !paymentStatus || !orderId) {
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
            return new NextResponse(null, { status: 200 })
        }

        // Guard against overwriting terminal statuses
        if (TERMINAL_STATUSES.has(payment.status)) {
            logger.info("Skipping IPN for terminal status", {
                orderId,
                currentStatus: payment.status,
                newStatus: paymentStatus,
            })
            return new NextResponse(null, { status: 200 })
        }

        const previousStatus = payment.status
        const shouldActivate = SUCCESS_STATUSES.has(paymentStatus) && !SUCCESS_STATUSES.has(previousStatus)
            && validateCryptoProductTier(payment.product, payment.tier, payment.id)

        // Validate payment amount before activation
        if (shouldActivate) {
            const expectedPrice = getCryptoPrice(payment.product as CryptoProduct, payment.tier as CryptoTier)
            if (!expectedPrice) {
                logger.error("Cannot resolve expected price for crypto payment — blocking activation", undefined, {
                    paymentId: payment.id, product: payment.product, tier: payment.tier,
                })
                // Return 500 so NOWPayments retries (price config may be a transient deploy issue)
                return new NextResponse(null, { status: 500 })
            }
            if (Math.abs(payment.priceAmount - expectedPrice.usdAmount) > 0.50) {
                logger.error("Crypto payment priceAmount does not match expected plan price — blocking activation", undefined, {
                    paymentId: payment.id, priceAmount: payment.priceAmount, expectedAmount: expectedPrice.usdAmount,
                })
                // Price mismatch is permanent — update status but don't activate
                await prisma.cryptoPayment.update({
                    where: { id: payment.id },
                    data: {
                        nowPaymentId: paymentId,
                        status: "price_mismatch",
                    },
                })
                return new NextResponse(null, { status: 200 })
            }
            const actuallyPaid = body.actually_paid != null ? Number(body.actually_paid) : 0
            const payAmount = body.pay_amount != null ? Number(body.pay_amount) : 0
            if (payAmount > 0 && actuallyPaid < payAmount * 0.95) {
                logger.error("Crypto payment underpaid — blocking activation", undefined, {
                    paymentId: payment.id, actuallyPaid, payAmount,
                })
                // Underpayment is permanent — update status but don't activate
                await prisma.cryptoPayment.update({
                    where: { id: payment.id },
                    data: {
                        nowPaymentId: paymentId,
                        status: "underpaid",
                        actuallyPaid: actuallyPaid,
                        payAmount: payAmount,
                    },
                })
                return new NextResponse(null, { status: 200 })
            }
        }

        // Update payment record with IPN data + activate subscription atomically
        if (shouldActivate) {
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
            await prisma.$transaction(async (tx) => {
                await tx.cryptoPayment.update({
                    where: { id: payment.id },
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
                await tx.user.update({
                    where: { id: payment.userId },
                    data: {
                        paymentMethod: "crypto",
                    },
                })
                await createCryptoSubscription(tx, payment.userId, payment.product, payment.tier, now, periodEnd, orderId)
            }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

            // Non-critical side effects outside transaction
            await postActivationSideEffects(payment, periodEnd)
        } else {
            // Non-activation status update
            await prisma.cryptoPayment.update({
                where: { id: payment.id },
                data: {
                    nowPaymentId: paymentId,
                    status: paymentStatus,
                    payCurrency: String(body.pay_currency ?? payment.payCurrency),
                    payAmount: Number(body.pay_amount ?? payment.payAmount),
                    actuallyPaid: body.actually_paid != null ? Number(body.actually_paid) : payment.actuallyPaid,
                },
            })
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
