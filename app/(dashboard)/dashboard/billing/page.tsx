import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { BillingToast } from "./billing-toast"
import { BillingContent } from "./billing-content"
import { getUserSubscriptionPlan } from "@/lib/subscription"

export default async function BillingPage() {
    const session = await auth()
    if (!session?.user?.id) redirect("/login")

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, paymentMethod: true },
    })

    if (!user) redirect("/login")

    const subscriptionPlan = await getUserSubscriptionPlan(user)
    const currentTier = subscriptionPlan.tier

    const isExpired = Boolean(subscriptionPlan.isExpired)

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
