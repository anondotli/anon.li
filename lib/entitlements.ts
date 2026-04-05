/**
 * Entitlement Resolution Layer
 *
 * Resolves a user's effective entitlements by querying their active subscriptions.
 * Falls back to legacy User-level Stripe fields for un-migrated users.
 *
 * This module is the runtime bridge between the Subscription table and
 * the canonical PLAN_ENTITLEMENTS config in config/plans.ts.
 */

import { prisma } from "@/lib/prisma"
import {
    getPlanFromPriceId,
    type Product,
    type PaidTier,
} from "@/config/plans"
import { DAY_MS } from "@/lib/constants"

type EffectiveTiers = {
    alias: "free" | PaidTier;
    drop: "free" | PaidTier;
}

const TIER_RANK: Record<string, number> = { free: 0, plus: 1, pro: 2 }

function higherTier(a: "free" | PaidTier, b: "free" | PaidTier): "free" | PaidTier {
    return (TIER_RANK[a] ?? 0) >= (TIER_RANK[b] ?? 0) ? a : b
}

/**
 * Resolve a user's effective tiers across alias and drop products.
 * Checks the Subscription table first, then falls back to legacy User fields.
 */
export async function getEffectiveTiers(userId: string): Promise<EffectiveTiers> {
    // Try new Subscription table first
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

    // Filter to non-expired subscriptions
    const now = Date.now()
    const active = subscriptions.filter(
        (s) => !s.currentPeriodEnd || new Date(s.currentPeriodEnd).getTime() + DAY_MS > now
    )

    if (active.length > 0) {
        let aliasTier: "free" | PaidTier = "free"
        let dropTier: "free" | PaidTier = "free"

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
        }

        return { alias: aliasTier, drop: dropTier }
    }

    // Fallback: legacy User-level Stripe fields for un-migrated users
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            stripePriceId: true,
            stripeCurrentPeriodEnd: true,
        },
    })

    if (!user?.stripePriceId || !user.stripeCurrentPeriodEnd) {
        return { alias: "free", drop: "free" }
    }

    if (new Date(user.stripeCurrentPeriodEnd).getTime() + DAY_MS < now) {
        return { alias: "free", drop: "free" }
    }

    const resolved = getPlanFromPriceId(user.stripePriceId)
    if (!resolved || (resolved.tier !== "plus" && resolved.tier !== "pro")) {
        return { alias: "free", drop: "free" }
    }

    const { product, tier } = resolved
    return {
        alias: (product === "alias" || product === "bundle") ? tier : "free",
        drop: (product === "drop" || product === "bundle") ? tier : "free",
    }
}

