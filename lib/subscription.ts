import { prisma } from "@/lib/prisma"
import { BUNDLE_PLANS, ALIAS_PLANS, DROP_PLANS, FORM_PLANS } from "@/config/plans"
import { DAY_MS } from "@/lib/constants"
import { recentDunningWhere } from "@/lib/services/billing-dunning"

function planFor(product: string, tier: string) {
    const plans = product === "bundle" ? BUNDLE_PLANS
        : product === "alias" ? ALIAS_PLANS
        : product === "form" ? FORM_PLANS
        : DROP_PLANS
    return plans[tier as "plus" | "pro"] ?? null
}

export async function getUserSubscriptionPlan(user: { id: string }) {
    const subscription = await prisma.subscription.findFirst({
        where: {
            userId: user.id,
            organizationId: null,
            status: { in: ["active", "trialing"] },
        },
        orderBy: { createdAt: "desc" },
    })

    if (subscription && subscription.currentPeriodEnd &&
        new Date(subscription.currentPeriodEnd).getTime() + DAY_MS >= Date.now()) {
        const { product, tier } = subscription
        const plan = planFor(product, tier)

        if (plan) {
            return {
                ...plan,
                product: product as "bundle" | "alias" | "drop" | "form",
                tier: tier as "plus" | "pro",
                isPaid: true,
                isCanceled: subscription.cancelAtPeriodEnd,
                isExpired: false,
                stripeCurrentPeriodEnd: subscription.currentPeriodEnd.getTime(),
                providerPriceId: subscription.providerPriceId as string | null,
                provider: subscription.provider as string | null,
            }
        }
    }

    // No entitling subscription. A Stripe subscription in dunning (past_due /
    // unpaid) is still live at Stripe and resumes once its payment is fixed:
    // surface it so the user is sent to Manage (billing portal) instead of
    // being offered a second, double-billed plan. Access stays revoked —
    // entitlements are resolved elsewhere and ignore past_due rows.
    const pastDue = await prisma.subscription.findFirst({
        where: {
            userId: user.id,
            organizationId: null,
            ...recentDunningWhere(),
        },
        orderBy: { updatedAt: "desc" },
    })

    if (pastDue) {
        const plan = planFor(pastDue.product, pastDue.tier)
        if (plan) {
            return {
                ...plan,
                product: pastDue.product as "bundle" | "alias" | "drop" | "form",
                tier: pastDue.tier as "plus" | "pro",
                isPaid: true,
                isCanceled: pastDue.cancelAtPeriodEnd,
                isExpired: true,
                stripeCurrentPeriodEnd: pastDue.currentPeriodEnd?.getTime() ?? null,
                providerPriceId: pastDue.providerPriceId as string | null,
                provider: pastDue.provider as string | null,
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
        providerPriceId: null as string | null,
        provider: null as string | null,
    }
}
