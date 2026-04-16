import { auth } from "@/auth"
import { PricingGrid } from "./grid"
import { prisma } from "@/lib/prisma"
import { getUserSubscriptionPlan } from "@/lib/subscription"
import { PricingSummary } from "./pricing-summary"

import { Metadata } from "next"
import { siteConfig } from "@/config/site"
import { getCspNonce } from "@/lib/csp"
import { getPricingJsonLd } from "@/lib/public-pricing"

export const metadata: Metadata = {
    title: siteConfig.pricing.metadata?.title,
    description: siteConfig.pricing.metadata?.description,
    alternates: {
        canonical: siteConfig.pricing.url,
    }
}

export default async function PricingPage() {
    const session = await auth()
    const nonce = await getCspNonce()

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

    return (
        <>
            <PricingGrid user={session?.user || null} currentPlanId={currentPlanId} />
            <PricingSummary />
            <script
                nonce={nonce}
                suppressHydrationWarning
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(getPricingJsonLd()) }}
            />
        </>
    )
}
