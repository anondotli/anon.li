"use server"

import { auth } from "@/auth"
import { stripe } from "@/lib/stripe"
import { redirect } from "next/navigation"
import Stripe from "stripe"
import {
    getStripePriceId,
    isValidProduct,
    isValidTier,
    isValidFrequency,
    type Product,
    type Tier,
    type BillingFrequency
} from "@/lib/stripe-prices"
import { runSecureAction, type ActionState } from "@/lib/safe-action"
import { createLogger } from "@/lib/logger"
import { prisma } from "@/lib/prisma"

const logger = createLogger("StripeCheckout")

interface CheckoutParams {
    product: Product
    tier: Tier
    frequency: BillingFrequency
    /** Optional promotion/coupon code to pre-apply */
    promoCode?: string
}

/**
 * Validate and parse checkout parameters from untrusted input.
 * Returns null if validation fails.
 */
function parseCheckoutParams(params: unknown): {
    product: Product
    tier: Tier
    frequency: BillingFrequency
    promoCode?: string
} | null {
    if (typeof params !== "object" || params === null) {
        return null
    }

    const obj = params as Record<string, unknown>

    if (!isValidProduct(obj.product) || !isValidTier(obj.tier) || !isValidFrequency(obj.frequency)) {
        return null
    }

    let promoCode: string | undefined
    if (obj.promoCode !== undefined) {
        if (typeof obj.promoCode !== "string" || obj.promoCode.length > 50) {
            logger.warn("Invalid promo code format, ignoring")
        } else if (obj.promoCode.length > 0) {
            // Sanitize: only allow alphanumeric, dashes, and underscores
            promoCode = obj.promoCode.replace(/[^a-zA-Z0-9_-]/g, "").toUpperCase()
        }
    }

    return {
        product: obj.product,
        tier: obj.tier,
        frequency: obj.frequency,
        promoCode
    }
}

/**
 * Create a Stripe checkout session for a subscription.
 */
export async function createCheckoutSession(params: CheckoutParams) {
    const session = await auth()

    if (!session?.user?.id || !session?.user?.email) {
        return { error: "Unauthorized" } as ActionState
    }

    const email = session.user.email

    const result = await runSecureAction<void, string>(
        { rateLimitKey: "stripeOps" },
        async (_data, userId) => {
            let priceId: string | null = null
            let promoCode: string | undefined

            const validatedParams = parseCheckoutParams(params)
            if (validatedParams) {
                priceId = getStripePriceId(validatedParams.product, validatedParams.tier, validatedParams.frequency)
                promoCode = validatedParams.promoCode
            }

            if (!priceId) {
                throw new Error("Invalid Price Configuration")
            }

            const existingSub = await prisma.subscription.findFirst({
                where: {
                    userId,
                    status: { in: ["active", "trialing"] },
                    currentPeriodEnd: { gt: new Date() },
                },
            })

            if (existingSub) {
                throw new Error("You already have an active subscription. Manage it from your billing page.")
            }

            // Base checkout session config
            const baseConfig = {
                mode: "subscription" as const,
                payment_method_types: ["card" as const],
                customer_email: email,
                client_reference_id: userId,
                line_items: [
                    {
                        price: priceId,
                        quantity: 1,
                    },
                ],
                success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?success=true`,
                cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?canceled=true`,
                metadata: {
                    userId,
                },
            }

            // Build the final config with promotion code handling
            let checkoutConfig: Stripe.Checkout.SessionCreateParams

            // If a specific promo code was provided, try to look it up and pre-apply it
            if (promoCode) {
                try {
                    // Look up the promotion code in Stripe
                    const promotionCodes = await stripe.promotionCodes.list({
                        code: promoCode,
                        active: true,
                        limit: 1,
                    })

                    const matchedPromo = promotionCodes.data[0];
                    if (matchedPromo) {
                        // Pre-apply the promotion code (uses discounts instead of allow_promotion_codes)
                        checkoutConfig = {
                            ...baseConfig,
                            discounts: [{ promotion_code: matchedPromo.id }],
                        }
                    } else {
                        logger.warn("Promo code not found or inactive", { promoCode })
                        // Fall back to allowing manual entry
                        checkoutConfig = {
                            ...baseConfig,
                            allow_promotion_codes: true,
                        }
                    }
                } catch (promoError) {
                    logger.error("Error looking up promo code", promoError)
                    // Continue without the promo code - user can still enter it manually
                    checkoutConfig = {
                        ...baseConfig,
                        allow_promotion_codes: true,
                    }
                }
            } else {
                // No promo code provided - allow customers to enter one manually
                checkoutConfig = {
                    ...baseConfig,
                    allow_promotion_codes: true,
                }
            }

            const checkoutSession = await stripe.checkout.sessions.create(checkoutConfig)

            if (!checkoutSession.url) {
                throw new Error("Failed to create checkout session")
            }

            return checkoutSession.url
        }
    )

    if (result.error) {
        return result
    }

    redirect(result.data!)
}
