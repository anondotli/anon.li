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
export async function getEffectiveTiers(userId: string | null): Promise<EffectiveTiers> {
    // A null userId means an org-owned resource whose creating user was deleted
    // (userId SetNull). There is no individual owner to derive entitlements from,
    // so fall back to free tier here; org-plan entitlements for such resources
    // are resolved via the org scope, not this per-user helper.
    if (!userId) {
        return { alias: "free", drop: "free", form: "free" }
    }

    const [subscriptions, user] = await Promise.all([
        prisma.subscription.findMany({
            where: {
                status: { in: ["active", "trialing"] },
                // Personal subs OR subs owned by any org the user is a member of
                // (seat-based inheritance): a member inherits the org's plan.
                OR: [
                    { userId },
                    { organization: { members: { some: { userId } } } },
                ],
            },
            select: {
                product: true,
                tier: true,
                currentPeriodEnd: true,
            },
        }),
        prisma.user.findUnique({
            where: { id: userId },
            select: { referralPlusUntil: true },
        }),
    ])

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
        // bundle and business both grant their tier across every product.
        if (product === "bundle" || product === "business" || product === "alias") {
            aliasTier = higherTier(aliasTier, tier)
        }
        if (product === "bundle" || product === "business" || product === "drop") {
            dropTier = higherTier(dropTier, tier)
        }
        if (product === "bundle" || product === "business" || product === "form") {
            formTier = higherTier(formTier, tier)
        }
    }

    // Referral Plus tops up every product to at least Plus while it's active,
    // without ever downgrading a paid Pro tier.
    if (user?.referralPlusUntil && new Date(user.referralPlusUntil).getTime() > now) {
        aliasTier = higherTier(aliasTier, "plus")
        dropTier = higherTier(dropTier, "plus")
        formTier = higherTier(formTier, "plus")
    }

    return { alias: aliasTier, drop: dropTier, form: formTier }
}
