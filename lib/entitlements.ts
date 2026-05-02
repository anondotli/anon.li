/**
 * Entitlement Resolution Layer
 *
 * Resolves a user's effective entitlements by querying their active subscriptions
 * in the canonical Subscription table.
 *
 * This module is the runtime bridge between the Subscription table and
 * the canonical PLAN_ENTITLEMENTS config in config/plans.ts.
 */

import { prisma } from "@/lib/prisma"
import type { Product, PaidTier } from "@/config/plans"
import { DAY_MS } from "@/lib/constants"

type EffectiveTiers = {
    alias: "free" | PaidTier;
    drop: "free" | PaidTier;
    form: "free" | PaidTier;
}

const TIER_RANK: Record<string, number> = { free: 0, plus: 1, pro: 2 }

function higherTier(a: "free" | PaidTier, b: "free" | PaidTier): "free" | PaidTier {
    return (TIER_RANK[a] ?? 0) >= (TIER_RANK[b] ?? 0) ? a : b
}

/**
 * Resolve a user's effective tiers across alias, drop, and form products.
 */
export async function getEffectiveTiers(userId: string): Promise<EffectiveTiers> {
    const subscriptions = await prisma.subscription.findMany({
        where: {
            userId,
            status: { in: ["active", "trialing"] },
        },
        select: {
            product: true,
            tier: true,
            currentPeriodEnd: true,
        },
    })

    const now = Date.now()
    const active = subscriptions.filter(
        (s) => !s.currentPeriodEnd || new Date(s.currentPeriodEnd).getTime() + DAY_MS > now
    )

    let aliasTier: "free" | PaidTier = "free"
    let dropTier: "free" | PaidTier = "free"
    let formTier: "free" | PaidTier = "free"

    for (const sub of active) {
        const tier = sub.tier as PaidTier
        if (tier !== "plus" && tier !== "pro") continue

        const product = sub.product as Product
        if (product === "bundle" || product === "alias") {
            aliasTier = higherTier(aliasTier, tier)
        }
        if (product === "bundle" || product === "drop") {
            dropTier = higherTier(dropTier, tier)
        }
        if (product === "bundle" || product === "form") {
            formTier = higherTier(formTier, tier)
        }
    }

    return { alias: aliasTier, drop: dropTier, form: formTier }
}
