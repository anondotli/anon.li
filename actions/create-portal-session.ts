"use server"

import { auth } from "@/auth"
import { getUserBillingState } from "@/lib/data/user"
import { stripe } from "@/lib/stripe"
import { isRedirectError } from "next/dist/client/components/redirect-error"
import { redirect } from "next/navigation"
import { rateLimit } from "@/lib/rate-limit"
import { createLogger } from "@/lib/logger"
import { getAuthUserState } from "@/lib/data/auth"
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
 * Shared guard for billing actions: auth + 2FA + ban + rate-limit checks.
 * Returns the authenticated userId, or a ready-to-return error response.
 */
async function guardBillingRequest(): Promise<
    | { ok: true; userId: string }
    | { ok: false; response: BillingActionError }
> {
    const session = await auth()

    if (!session?.user?.id) {
        return { ok: false, response: { status: "error", message: "Not authenticated" } }
    }

    if (session.user.twoFactorEnabled && !session.twoFactorVerified) {
        return { ok: false, response: { status: "error", message: "Two-factor authentication required" } }
    }

    const authUser = await getAuthUserState(session.user.id)
    if (!authUser || authUser.banned) {
        return { ok: false, response: { status: "error", message: "Unauthorized" } }
    }

    // Rate limit check - Stripe API calls are expensive
    const rateLimited = await rateLimit("stripeOps", session.user.id)
    if (rateLimited) {
        return { ok: false, response: { status: "error", message: "Too many requests. Please try again later." } }
    }

    return { ok: true, userId: session.user.id }
}

export async function createPortalSession() {
    const guard = await guardBillingRequest()
    if (!guard.ok) return guard.response

    const user = await getUserBillingState(guard.userId)

    if (!user?.stripeCustomerId) {
        return { status: "error", message: "No subscription found" }
    }

    try {
        const portalSession = await stripe.billingPortal.sessions.create({
            customer: user.stripeCustomerId,
            return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
        })

        redirect(portalSession.url)
    } catch (error) {
        if (isRedirectError(error)) {
            throw error
        }
        logger.error("Error creating portal session", error)
        return {
            status: "error",
            message: "Failed to create portal session",
        }
    }
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
    const guard = await guardBillingRequest()
    if (!guard.ok) return guard.response

    if (!isValidProduct(params.product) || !isValidTier(params.tier) || !isValidFrequency(params.frequency)) {
        return { status: "error", message: "Invalid plan selection" }
    }

    const billing = await getUserBillingState(guard.userId)
    if (!billing?.stripeCustomerId) {
        // Crypto subscribers have no Stripe customer — they manage changes elsewhere.
        return { status: "error", message: "No card subscription to change. Manage your plan from the billing page." }
    }

    const targetPriceId = getStripePriceId(params.product, params.tier, params.frequency)
    if (!targetPriceId) {
        return { status: "error", message: "That plan isn't available right now." }
    }

    const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`
    let url: string | null = null

    try {
        const subs = await stripe.subscriptions.list({
            customer: billing.stripeCustomerId,
            status: "active",
            limit: 1,
        })
        const sub = subs.data[0]
        const item = sub?.items.data[0]

        let flowData: Stripe.BillingPortal.SessionCreateParams.FlowData | undefined
        if (sub && item) {
            flowData = {
                type: "subscription_update_confirm",
                subscription_update_confirm: {
                    subscription: sub.id,
                    items: [{ id: item.id, price: targetPriceId, quantity: 1 }],
                },
            }
        }

        const portalSession = await stripe.billingPortal.sessions.create({
            customer: billing.stripeCustomerId,
            return_url: returnUrl,
            ...(flowData ? { flow_data: flowData } : {}),
        })
        url = portalSession.url
    } catch (error) {
        logger.error("Subscription change flow failed; falling back to generic portal", error)
        try {
            const portalSession = await stripe.billingPortal.sessions.create({
                customer: billing.stripeCustomerId,
                return_url: returnUrl,
            })
            url = portalSession.url
        } catch (fallbackError) {
            logger.error("Generic portal fallback failed", fallbackError)
            return { status: "error", message: "Failed to open the billing portal. Please try again." }
        }
    }

    redirect(url)
}
