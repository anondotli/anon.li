import { prisma } from "@/lib/prisma"
import { BUNDLE_PLANS, ALIAS_PLANS, DROP_PLANS, FORM_PLANS } from "@/config/plans"
import { DAY_MS } from "@/lib/constants"

export async function getUserSubscriptionPlan(user: { id: string }) {
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
