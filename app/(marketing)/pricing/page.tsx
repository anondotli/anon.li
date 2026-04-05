import { auth } from "@/auth"
import { PricingGrid } from "./grid"
import { prisma } from "@/lib/prisma"
import { getUserSubscriptionPlan } from "@/lib/subscription"

import { Metadata } from "next"
import { siteConfig } from "@/config/site"

export const metadata: Metadata = {
    title: siteConfig.pricing.metadata?.title,
    description: siteConfig.pricing.metadata?.description,
    alternates: {
        canonical: siteConfig.pricing.url,
    }
}

export default async function PricingPage() {
    const session = await auth()

    let currentPlanId: string | null = null
    if (session?.user?.id) {
        const user = await prisma.user.findUnique({ where: { id: session.user.id } })
        if (user) {
            const subscriptionPlan = await getUserSubscriptionPlan(user)
            if (subscriptionPlan.isPaid) {
                currentPlanId = `${subscriptionPlan.product}_${subscriptionPlan.tier}`
            }
        }
    }

    return <PricingGrid user={session?.user || null} currentPlanId={currentPlanId} />
}
