import type { User } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { BUNDLE_PLANS, getPlanFromPriceId, ALIAS_PLANS, DROP_PLANS, FORM_PLANS } from "@/config/plans"
import { DAY_MS } from "@/lib/constants"

export async function getUserSubscriptionPlan(user: Pick<User, "id" | "stripePriceId" | "stripeCurrentPeriodEnd" | "stripeCancelAtPeriodEnd">) {
    // Try new Subscription table first
    const subscription = await prisma.subscription.findFirst({
        where: {
            userId: user.id,
            status: { in: ["active", "trialing"] },
        },
        orderBy: { createdAt: "desc" },
    })

    if (subscription && subscription.currentPeriodEnd &&
        new Date(subscription.currentPeriodEnd).getTime() + DAY_MS >= Date.now()) {
        const { product, tier } = subscription
        const plans = product === "bundle" ? BUNDLE_PLANS
            : product === "alias" ? ALIAS_PLANS
            : product === "form" ? FORM_PLANS
            : DROP_PLANS
        const plan = plans[tier as "plus" | "pro"]

        if (plan) {
            return {
                ...plan,
                product: product as "bundle" | "alias" | "drop" | "form",
                tier: tier as "plus" | "pro",
                isPaid: true,
                isCanceled: subscription.cancelAtPeriodEnd,
                isExpired: false,
                stripeCurrentPeriodEnd: subscription.currentPeriodEnd.getTime(),
            }
        }
    }

    // Fallback: legacy User-level Stripe fields
    const priceId = user.stripePriceId
    const isExpired = user.stripeCurrentPeriodEnd && new Date(user.stripeCurrentPeriodEnd).getTime() + DAY_MS < Date.now()

    if (priceId && !isExpired) {
        const planInfo = getPlanFromPriceId(priceId)

        if (planInfo) {
            const { product, tier } = planInfo

            let plan
            if (product === 'bundle') plan = BUNDLE_PLANS[tier as 'plus' | 'pro']
            else if (product === 'alias') plan = ALIAS_PLANS[tier as 'plus' | 'pro']
            else if (product === 'drop') plan = DROP_PLANS[tier as 'plus' | 'pro']
            else if (product === 'form') plan = FORM_PLANS[tier as 'plus' | 'pro']

            if (plan) {
                return {
                    ...plan,
                    product,
                    tier,
                    isPaid: true,
                    isCanceled: user.stripeCancelAtPeriodEnd ?? false,
                    isExpired: false,
                    stripeCurrentPeriodEnd: user.stripeCurrentPeriodEnd?.getTime() || null,
                }
            }
        }
    }

    return {
        ...BUNDLE_PLANS.free,
        product: 'bundle' as const,
        tier: 'free' as const,
        isPaid: false,
        isCanceled: false,
        isExpired: false,
        stripeCurrentPeriodEnd: null,
    }
}
