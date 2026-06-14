"use server"

import { z } from "zod"
import { stripe } from "@/lib/stripe"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { runScopedAction, type ActionState } from "@/lib/safe-action"
import { ValidationError } from "@/lib/api-error-utils"
import { createLogger } from "@/lib/logger"

const logger = createLogger("OrgBilling")

/**
 * Resolve the active org's Stripe subscription (the canonical local row). All
 * org billing management acts on exactly this subscription — never the owner's
 * personal one — so personal billing and team billing can't cross-contaminate.
 */
async function getActiveOrgStripeSub(organizationId: string) {
    return prisma.subscription.findFirst({
        where: {
            organizationId,
            provider: "stripe",
            status: { in: ["active", "trialing"] },
            providerSubscriptionId: { not: null },
        },
        orderBy: { createdAt: "desc" },
        select: { providerSubscriptionId: true, providerCustomerId: true },
    })
}

/**
 * Open the Stripe Customer Portal scoped to the ORG's subscription customer so an
 * owner can update the payment method, view invoices, and cancel the team plan.
 * Owner-only (runScopedAction minRole "owner" also guarantees an org context).
 */
export async function createOrgPortalSession(): Promise<ActionState> {
    const result = await runScopedAction<void, string>(
        { rateLimitKey: "stripeOps", minRole: "owner" },
        async (_data, scope) => {
            const organizationId = scope.organizationId as string
            const sub = await getActiveOrgStripeSub(organizationId)
            if (!sub?.providerCustomerId) {
                throw new Error("No active team subscription to manage.")
            }
            const portal = await stripe.billingPortal.sessions.create({
                customer: sub.providerCustomerId,
                return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/team`,
            })
            return portal.url
        },
    )

    if (result.error) return result
    redirect(result.data!)
}

const updateSeatsSchema = z.object({ seats: z.number().int().min(1).max(10000) })

/**
 * Change the team's paid seat count. Owner-only. The new seat count must be at
 * least the current member count — we never let an owner drop seats below the
 * members already using the plan (the user-chosen "block over-subscription"
 * policy; existing members keep access, so this prevents under-billing rather
 * than silently revoking anyone). The webhook syncs the new quantity back.
 */
export async function updateOrgSeats(input: z.infer<typeof updateSeatsSchema>): Promise<ActionState> {
    return runScopedAction<z.infer<typeof updateSeatsSchema>, { seats: number }>(
        { schema: updateSeatsSchema, data: input, rateLimitKey: "stripeOps", minRole: "owner" },
        async (validated, scope) => {
            const organizationId = scope.organizationId as string

            const memberCount = await prisma.member.count({ where: { organizationId } })
            const seats = Math.max(validated.seats, 1)
            if (seats < memberCount) {
                throw new ValidationError(
                    `Your team has ${memberCount} members. Remove members before reducing below ${memberCount} seats.`,
                )
            }

            const sub = await getActiveOrgStripeSub(organizationId)
            if (!sub?.providerSubscriptionId) {
                throw new ValidationError("No active team subscription to update.")
            }

            const stripeSub = await stripe.subscriptions.retrieve(sub.providerSubscriptionId)
            const itemId = stripeSub.items.data[0]?.id
            if (!itemId) throw new Error("Subscription has no billable item")

            await stripe.subscriptions.update(sub.providerSubscriptionId, {
                items: [{ id: itemId, quantity: seats }],
                proration_behavior: "create_prorations",
            })
            logger.info("Org seats updated", { organizationId, seats })

            // The customer.subscription.updated webhook syncs `seats` to our DB.
            return { seats }
        },
    )
}
