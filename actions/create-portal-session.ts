"use server"

import { prisma } from "@/lib/prisma"
import { getUserBillingState } from "@/lib/data/user"
import { stripe } from "@/lib/stripe"
import { redirect } from "next/navigation"
import { runSecureAction } from "@/lib/safe-action"
import { ValidationError } from "@/lib/api-error-utils"
import { createLogger } from "@/lib/logger"
import Stripe from "stripe"
import {
    getStripePriceId,
    isValidProduct,
    isValidTier,
    isValidFrequency,
    type Product,
    type Tier,
    type BillingFrequency,
} from "@/lib/stripe-prices"

const logger = createLogger("StripePortal")

type BillingActionError = { status: "error"; message: string }

/**
 * Open the Stripe Customer Portal for the user's PERSONAL billing. Auth, 2FA, ban
 * and rate-limiting are handled by runSecureAction; we return the portal URL from
 * the handler and redirect outside it (redirect() throws NEXT_REDIRECT, which the
 * wrapper's try/catch would otherwise swallow).
 */
export async function createPortalSession(): Promise<BillingActionError | void> {
    const result = await runSecureAction<void, string>(
        { rateLimitKey: "stripeOps" },
        async (_data, userId) => {
            const user = await getUserBillingState(userId)
            if (!user?.stripeCustomerId) {
                throw new ValidationError("No subscription found")
            }
            try {
                const portalSession = await stripe.billingPortal.sessions.create({
                    customer: user.stripeCustomerId,
                    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
                })
                return portalSession.url
            } catch (error) {
                logger.error("Error creating portal session", error)
                throw new ValidationError("Failed to create portal session")
            }
        },
    )

    if (result.error) return { status: "error", message: result.error }
    redirect(result.data!)
}

/**
 * Send an existing card subscriber straight into Stripe's "update subscription"
 * flow with the target price pre-selected, so a Plus→Pro (or cross-product) change
 * is a single confirm instead of an error.
 *
 * Why this exists: createCheckoutSession refuses a second subscription, so without
 * this an upgrade click just errors and dumps the user on the billing page.
 *
 * Falls back to the generic billing portal if the confirm flow is rejected (e.g.
 * the Customer Portal doesn't have subscription updates enabled for these prices).
 */
export async function createSubscriptionChangeSession(params: {
    product: Product
    tier: Tier
    frequency: BillingFrequency
}): Promise<BillingActionError | void> {
    const result = await runSecureAction<void, string>(
        { rateLimitKey: "stripeOps" },
        async (_data, userId) => {
            if (!isValidProduct(params.product) || !isValidTier(params.tier) || !isValidFrequency(params.frequency)) {
                throw new ValidationError("Invalid plan selection")
            }

            const billing = await getUserBillingState(userId)
            if (!billing?.stripeCustomerId) {
                // Crypto subscribers have no Stripe customer — they manage changes elsewhere.
                throw new ValidationError("No card subscription to change. Manage your plan from the billing page.")
            }

            const targetPriceId = getStripePriceId(params.product, params.tier, params.frequency)
            if (!targetPriceId) {
                throw new ValidationError("That plan isn't available right now.")
            }

            const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`

            try {
                // Target ONLY the user's personal subscription. The owner's org Business
                // subscription shares the same Stripe customer, so a blind "first active
                // sub" lookup could rewrite the org sub to quantity:1 and collapse its
                // seats. Resolve the personal sub from our canonical table (organizationId
                // null) and act on exactly that Stripe subscription.
                const personalSub = await prisma.subscription.findFirst({
                    where: {
                        userId,
                        provider: "stripe",
                        organizationId: null,
                        status: { in: ["active", "trialing"] },
                        providerSubscriptionId: { not: null },
                    },
                    select: { providerSubscriptionId: true },
                    orderBy: { createdAt: "desc" },
                })

                let flowData: Stripe.BillingPortal.SessionCreateParams.FlowData | undefined
                if (personalSub?.providerSubscriptionId) {
                    const sub = await stripe.subscriptions.retrieve(personalSub.providerSubscriptionId)
                    const item = sub.items.data[0]
                    if (item) {
                        flowData = {
                            type: "subscription_update_confirm",
                            subscription_update_confirm: {
                                subscription: sub.id,
                                items: [{ id: item.id, price: targetPriceId, quantity: 1 }],
                            },
                        }
                    }
                }

                const portalSession = await stripe.billingPortal.sessions.create({
                    customer: billing.stripeCustomerId,
                    return_url: returnUrl,
                    ...(flowData ? { flow_data: flowData } : {}),
                })
                return portalSession.url
            } catch (error) {
                logger.error("Subscription change flow failed; falling back to generic portal", error)
                try {
                    const portalSession = await stripe.billingPortal.sessions.create({
                        customer: billing.stripeCustomerId,
                        return_url: returnUrl,
                    })
                    return portalSession.url
                } catch (fallbackError) {
                    logger.error("Generic portal fallback failed", fallbackError)
                    throw new ValidationError("Failed to open the billing portal. Please try again.")
                }
            }
        },
    )

    if (result.error) return { status: "error", message: result.error }
    redirect(result.data!)
}
