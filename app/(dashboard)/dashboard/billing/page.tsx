import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { BillingToast } from "./billing-toast"
import { BillingContent } from "./billing-content"
import { getUserSubscriptionPlan } from "@/lib/subscription"
import { getReferralStats, REFERRAL_REWARD_DAYS } from "@/lib/services/referral"

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

    const referral = await getReferralStats(session.user.id)

    return (
        <>
            <BillingToast />
            <BillingContent
                currentTier={currentTier}
                subscriptionStatus={subscriptionStatus}
                currentPeriodEnd={currentPeriodEnd}
                paymentMethod={user.paymentMethod}
                product={subscriptionPlan.product}
                referral={{
                    successfulReferrals: referral.successfulReferrals,
                    plusUntil: referral.plusUntil ? referral.plusUntil.toISOString() : null,
                    plusActive: referral.plusActive,
                    rewardDays: REFERRAL_REWARD_DAYS,
                }}
            />
        </>
    )
}
