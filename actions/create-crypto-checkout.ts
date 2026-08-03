"use server"

import { createCryptoPayment } from "@/lib/data/crypto-payment"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { nanoid } from "nanoid"
import { getNOWPaymentsClient } from "@/lib/nowpayments"
import {
    getCryptoPrice,
    isValidCryptoInterval,
    isValidCryptoProduct,
    isValidCryptoTier,
    type CryptoInterval,
    type CryptoProduct,
    type CryptoTier,
} from "@/lib/crypto-prices"
import { runSecureAction } from "@/lib/safe-action"
import { trackServerEvent } from "@/lib/posthog.server"

interface CryptoCheckoutParams {
    product: CryptoProduct
    tier: CryptoTier
    interval: CryptoInterval
}

export async function createCryptoCheckout(params: CryptoCheckoutParams) {
    const result = await runSecureAction<void, string>(
        { rateLimitKey: "stripeOps" },
        async (_data, userId) => {
            if (
                !isValidCryptoProduct(params.product)
                || !isValidCryptoTier(params.tier)
                || !isValidCryptoInterval(params.interval)
            ) {
                throw new Error("Invalid plan selection")
            }

            const price = getCryptoPrice(params.product, params.tier, params.interval)
            if (!price) {
                throw new Error("Invalid price configuration")
            }

            // Check for existing active subscription
            const existingSub = await prisma.subscription.findFirst({
                where: {
                    userId,
                    organizationId: null,
                    status: { in: ["active", "trialing"] },
                    currentPeriodEnd: { gt: new Date() },
                },
            })

            if (existingSub) {
                throw new Error("You already have an active subscription. Please wait for it to expire or cancel it first.")
            }

            const orderId = `crypto_${nanoid(21)}`
            const appUrl = process.env.NEXT_PUBLIC_APP_URL!

            const nowpayments = getNOWPaymentsClient()

            const invoice = await nowpayments.createInvoice({
                priceAmount: price.usdAmount,
                priceCurrency: "usd",
                orderId,
                orderDescription: `anon.li ${price.label}`,
                ipnCallbackUrl: `${appUrl}/api/webhooks/nowpayments`,
                successUrl: `${appUrl}/dashboard/billing/crypto-success?orderId=${orderId}`,
                cancelUrl: `${appUrl}/dashboard/billing?canceled=true`,
            })

            await createCryptoPayment({
                nowPaymentId: orderId,
                invoiceId: String(invoice.id),
                orderId,
                payAmount: 0,
                payCurrency: "pending",
                priceAmount: price.usdAmount,
                priceCurrency: "usd",
                product: params.product,
                tier: params.tier,
                planPriceId: price.stripePriceId,
                status: "waiting",
                userId,
            })

            // Crypto funnel entry (created → paid/expired).
            trackServerEvent(userId, "crypto_invoice_created", {
                product: params.product,
                tier: params.tier,
                interval: params.interval,
                amount: price.usdAmount,
                order_id: orderId,
            })

            return invoice.invoice_url
        }
    )

    if (result.error) {
        return result
    }

    redirect(result.data!)
}
