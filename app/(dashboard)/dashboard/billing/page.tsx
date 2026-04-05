import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { BillingToast } from "./billing-toast"
import { BillingContent } from "./billing-content"
import { getUserSubscriptionPlan } from "@/lib/subscription"
import { DAY_MS } from "@/lib/constants"

export default async function BillingPage() {
    const session = await auth()
    if (!session?.user?.id) redirect("/login")

    const user = await prisma.user.findUnique({
        where: { id: session.user.id }
    })

    if (!user) redirect("/login")

    const subscriptionPlan = await getUserSubscriptionPlan(user)
    const currentTier = subscriptionPlan.tier === 'guest' ? 'free' : subscriptionPlan.tier

    // Compute isExpired directly from user fields — getUserSubscriptionPlan falls through to free for expired
    const now = new Date()
    const isExpired = !!(user.stripePriceId && user.stripeCurrentPeriodEnd &&
        new Date(user.stripeCurrentPeriodEnd).getTime() + DAY_MS < now.getTime())

    // Determine subscription status
    const subscriptionStatus = isExpired
        ? "past_due" as const
        : subscriptionPlan.isCanceled
            ? "canceled" as const
            : (subscriptionPlan.isPaid ? "active" as const : undefined)

    const currentPeriodEnd = subscriptionPlan.stripeCurrentPeriodEnd
        ? new Date(subscriptionPlan.stripeCurrentPeriodEnd)
        : undefined

    return (
        <>
            <BillingToast />
            <BillingContent
                currentTier={currentTier}
                subscriptionStatus={subscriptionStatus}
                currentPeriodEnd={currentPeriodEnd}
                paymentMethod={user.paymentMethod}
                product={subscriptionPlan.product}
            />
        </>
    )
}
