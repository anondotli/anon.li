"use server"

import { createCryptoPayment } from "@/lib/data/crypto-payment"
import { getUserBillingState } from "@/lib/data/user"
import { redirect } from "next/navigation"
import { nanoid } from "nanoid"
import { getNOWPaymentsClient } from "@/lib/nowpayments"
import {
    getCryptoPrice,
    isValidCryptoProduct,
    isValidCryptoTier,
    type CryptoProduct,
    type CryptoTier,
} from "@/lib/crypto-prices"
import { runSecureAction } from "@/lib/safe-action"

interface CryptoCheckoutParams {
    product: CryptoProduct
    tier: CryptoTier
}

export async function createCryptoCheckout(params: CryptoCheckoutParams) {
    const result = await runSecureAction<void, string>(
        { rateLimitKey: "stripeOps" },
        async (_data, userId) => {
            if (!isValidCryptoProduct(params.product) || !isValidCryptoTier(params.tier)) {
                throw new Error("Invalid plan selection")
            }

            const price = getCryptoPrice(params.product, params.tier)
            if (!price) {
                throw new Error("Invalid price configuration")
            }

            // Check for existing active subscription
            const user = await getUserBillingState(userId)

            if (user?.stripePriceId && user.stripeCurrentPeriodEnd && new Date(user.stripeCurrentPeriodEnd) > new Date()) {
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

            return invoice.invoice_url
        }
    )

    if (result.error) {
        return result
    }

    redirect(result.data!)
}
