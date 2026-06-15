"use server"

import { auth } from "@/auth"
import { stripe } from "@/lib/stripe"
import { redirect } from "next/navigation"
import { runScopedAction, type ActionState } from "@/lib/safe-action"
import { isOrgScope } from "@/lib/ownership"
import { ValidationError } from "@/lib/api-error-utils"
import { BUSINESS_PLAN } from "@/config/plans"
import { prisma } from "@/lib/prisma"

interface TeamCheckoutParams {
    frequency: "monthly" | "yearly"
    /** Requested seat count; clamped to at least the current member count. */
    seats?: number
}

/**
 * Start a per-seat Business (Teams) checkout for the active organization.
 * Owner-only. The subscription carries { userId, organizationId } in its
 * metadata so the webhook (upsertStripeSubscription) attaches it to the org and
 * records the seat quantity, and org entitlement inheritance grants every member
 * the plan.
 */
export async function createTeamCheckoutSession(params: TeamCheckoutParams) {
    const session = await auth()
    if (!session?.user?.email) {
        return { error: "Unauthorized" } as ActionState
    }
    const email = session.user.email

    const result = await runScopedAction<void, string>(
        { rateLimitKey: "stripeOps", minRole: "owner" },
        async (_data, scope) => {
            // minRole: "owner" guarantees an active org context; narrow to a string id.
            if (!isOrgScope(scope)) throw new Error("Organization context required")
            const { organizationId } = scope

            const frequency = params.frequency === "yearly" ? "yearly" : "monthly"
            const priceId = BUSINESS_PLAN.priceIds?.[frequency]
            if (!priceId) {
                throw new Error("The Business plan is not configured. Set STRIPE_BUSINESS_*_PRICE_ID.")
            }

            // One active subscription per org.
            const existing = await prisma.subscription.findFirst({
                where: {
                    organizationId,
                    status: { in: ["active", "trialing"] },
                    currentPeriodEnd: { gt: new Date() },
                },
            })
            if (existing) {
                throw new ValidationError("Your team already has an active subscription. Manage it from billing.")
            }

            // Owner chooses how many seats to buy (default 2); never below the
            // current member count so existing members can't be left unpaid.
            const memberCount = await prisma.member.count({ where: { organizationId } })
            const requested = Math.min(Math.max(Math.trunc(params.seats ?? 2), 1), 10000)
            const seats = Math.max(requested, memberCount)

            const checkoutSession = await stripe.checkout.sessions.create({
                mode: "subscription",
                payment_method_types: ["card"],
                customer_email: email,
                client_reference_id: scope.userId,
                line_items: [{ price: priceId, quantity: seats }],
                allow_promotion_codes: true,
                subscription_data: {
                    metadata: { userId: scope.userId, organizationId },
                },
                metadata: { userId: scope.userId, organizationId },
                success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/team?success=true`,
                cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/team?canceled=true`,
            })

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
