import { getPlanFromPriceId, type Product, type Tier } from "@/config/plans"
import { ALIAS_LIMITS, STORAGE_LIMITS, DROP_SIZE_LIMITS, EXPIRY_LIMITS, DROP_FEATURES } from "@/config/plans"
import { PLAN_ENTITLEMENTS, type AliasEntitlements } from "@/config/plans"
import { DAY_MS } from "@/lib/constants"

type DropFeatures = typeof DROP_FEATURES[keyof typeof DROP_FEATURES];
type DropLimits = {
    maxStorage: number;
    maxFileSize: number;
    maxExpiry: number;
    downloadLimits: boolean;
    features: DropFeatures;
};

// Legacy type kept for callers that still pass a user object
type UserSub = { stripePriceId?: string | null; stripeCurrentPeriodEnd?: Date | null }

function resolveSubscription(user?: UserSub | null): { product: Product; tier: Tier } | null {
    if (!user?.stripePriceId || !user.stripeCurrentPeriodEnd) return null
    if (new Date(user.stripeCurrentPeriodEnd).getTime() + DAY_MS < Date.now()) return null
    return getPlanFromPriceId(user.stripePriceId)
}

/**
 * Get alias limits for a user. Prefers async resolution via Subscription table.
 * Falls back to synchronous legacy resolution if a user object is passed.
 */
export function getPlanLimits(user?: UserSub | null): AliasEntitlements {
    const resolved = resolveSubscription(user)
    if (!resolved) return ALIAS_LIMITS.free

    const { product, tier } = resolved
    if ((product === 'alias' || product === 'bundle') && (tier === 'plus' || tier === 'pro')) {
        return ALIAS_LIMITS[tier]
    }
    return ALIAS_LIMITS.free
}

/**
 * Get alias limits formatted for user-facing surfaces.
 * Pro random aliases are intentionally displayed as unlimited even though
 * enforcement uses a hidden high cap.
 */
export function getDisplayPlanLimits(user?: UserSub | null): AliasEntitlements {
    const resolved = resolveSubscription(user)

    if (!resolved) return ALIAS_LIMITS.free

    const { product, tier } = resolved
    if ((product === "alias" || product === "bundle") && (tier === "plus" || tier === "pro")) {
        return ALIAS_LIMITS[tier]
    }

    return ALIAS_LIMITS.free
}

/**
 * Async alias limits resolution via Subscription table.
 */
export async function getPlanLimitsAsync(userId: string): Promise<AliasEntitlements> {
    const { getEffectiveTiers } = await import("@/lib/entitlements")
    const tiers = await getEffectiveTiers(userId)
    return PLAN_ENTITLEMENTS.alias[tiers.alias]
}

export function getDropLimits(user?: UserSub | null): DropLimits {
    const freeLimits: DropLimits = {
        maxStorage: STORAGE_LIMITS.free,
        maxFileSize: DROP_SIZE_LIMITS.free,
        maxExpiry: EXPIRY_LIMITS.free,
        downloadLimits: DROP_FEATURES.free.downloadLimits,
        features: DROP_FEATURES.free,
    }

    const resolved = resolveSubscription(user)
    if (!resolved) return freeLimits

    const { product, tier } = resolved
    if ((product === 'drop' || product === 'bundle') && (tier === 'plus' || tier === 'pro')) {
        return {
            maxStorage: STORAGE_LIMITS[tier],
            maxFileSize: DROP_SIZE_LIMITS[tier],
            maxExpiry: EXPIRY_LIMITS[tier],
            downloadLimits: DROP_FEATURES[tier].downloadLimits,
            features: DROP_FEATURES[tier],
        }
    }
    return freeLimits
}

/**
 * Get effective tier for a user across both products.
 * Returns the highest tier the user has access to.
 */
export function getEffectiveTier(user?: UserSub | null): 'free' | 'plus' | 'pro' {
    const tier = resolveSubscription(user)?.tier
    return (tier === 'plus' || tier === 'pro') ? tier : 'free'
}

/**
 * Get product type from price ID
 */
export function getProductFromPriceId(stripePriceId?: string | null): 'bundle' | 'alias' | 'drop' | null {
    if (!stripePriceId) return null
    return getPlanFromPriceId(stripePriceId)?.product ?? null
}

/**
 * Get recipient limit for a user based on their subscription.
 * Recipients are verified email addresses that aliases can forward to.
 */
export function getRecipientLimit(user?: UserSub | null): number {
    return getPlanLimits(user).recipients
}
