"use server"

import { auth } from "@/auth"
import { getUserBillingState } from "@/lib/data/user"
import { stripe } from "@/lib/stripe"
import { isRedirectError } from "next/dist/client/components/redirect-error"
import { redirect } from "next/navigation"
import { rateLimit } from "@/lib/rate-limit"
import { createLogger } from "@/lib/logger"
import { getAuthUserState } from "@/lib/data/auth"

const logger = createLogger("StripePortal")

export async function createPortalSession() {
    const session = await auth()

    if (!session?.user?.id) {
        return {
            status: "error",
            message: "Not authenticated",
        }
    }

    if (session.user.twoFactorEnabled && !session.twoFactorVerified) {
        return {
            status: "error",
            message: "Two-factor authentication required",
        }
    }

    const authUser = await getAuthUserState(session.user.id)
    if (!authUser || authUser.banned) {
        return {
            status: "error",
            message: "Unauthorized",
        }
    }

    // Rate limit check - Stripe API calls are expensive
    const rateLimited = await rateLimit("stripeOps", session.user.id)
    if (rateLimited) {
        return {
            status: "error",
            message: "Too many requests. Please try again later.",
        }
    }

    const user = await getUserBillingState(session.user.id)

    if (!user?.stripeCustomerId) {
        return {
            status: "error",
            message: "No subscription found",
        }
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
