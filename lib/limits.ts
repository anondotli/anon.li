import {
    ALIAS_LIMITS,
    STORAGE_LIMITS,
    DROP_SIZE_LIMITS,
    EXPIRY_LIMITS,
    DROP_FEATURES,
    PLAN_ENTITLEMENTS,
    type AliasEntitlements,
    type FormEntitlements,
    type PaidTier,
    type Product,
} from "@/config/plans"
import { DAY_MS } from "@/lib/constants"

type DropFeatures = typeof DROP_FEATURES[keyof typeof DROP_FEATURES];
type DropLimits = {
    maxStorage: number;
    maxFileSize: number;
    maxExpiry: number;
    downloadLimits: boolean;
    features: DropFeatures;
};

export type SubscriptionLike = {
    status: string
    product: string
    tier: string
    currentPeriodEnd: Date | null
}
export type UserSub = { subscriptions?: SubscriptionLike[] | null }

const TIER_RANK: Record<string, number> = { free: 0, plus: 1, pro: 2 }

function isActive(sub: SubscriptionLike): boolean {
    if (sub.status !== "active" && sub.status !== "trialing") return false
    if (sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() + DAY_MS < Date.now()) return false
    return true
}

function higherTier(a: 'free' | PaidTier, b: 'free' | PaidTier): 'free' | PaidTier {
    return (TIER_RANK[a] ?? 0) >= (TIER_RANK[b] ?? 0) ? a : b
}

function resolveTierForProduct(user: UserSub | null | undefined, product: Product): 'free' | PaidTier {
    if (!user?.subscriptions) return 'free'
    let best: 'free' | PaidTier = 'free'
    for (const sub of user.subscriptions) {
        if (!isActive(sub)) continue
        if (sub.tier !== 'plus' && sub.tier !== 'pro') continue
        if (sub.product !== 'bundle' && sub.product !== product) continue
        best = higherTier(best, sub.tier as PaidTier)
    }
    return best
}

export function getPlanLimits(user?: UserSub | null): AliasEntitlements {
    const tier = resolveTierForProduct(user, 'alias')
    return tier === 'free' ? ALIAS_LIMITS.free : ALIAS_LIMITS[tier]
}

/**
 * Get alias limits formatted for user-facing surfaces.
 * Pro random aliases are intentionally displayed as unlimited even though
 * enforcement uses a hidden high cap.
 */
export function getDisplayPlanLimits(user?: UserSub | null): AliasEntitlements {
    return getPlanLimits(user)
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
    const tier = resolveTierForProduct(user, 'drop')
    if (tier === 'free') {
        return {
            maxStorage: STORAGE_LIMITS.free,
            maxFileSize: DROP_SIZE_LIMITS.free,
            maxExpiry: EXPIRY_LIMITS.free,
            downloadLimits: DROP_FEATURES.free.downloadLimits,
            features: DROP_FEATURES.free,
        }
    }
    return {
        maxStorage: STORAGE_LIMITS[tier],
        maxFileSize: DROP_SIZE_LIMITS[tier],
        maxExpiry: EXPIRY_LIMITS[tier],
        downloadLimits: DROP_FEATURES[tier].downloadLimits,
        features: DROP_FEATURES[tier],
    }
}

export function getFormLimits(user?: UserSub | null): FormEntitlements {
    const tier = resolveTierForProduct(user, 'form')
    return PLAN_ENTITLEMENTS.form[tier]
}

export async function getFormLimitsAsync(userId: string): Promise<FormEntitlements> {
    const { getEffectiveTiers } = await import("@/lib/entitlements")
    const tiers = await getEffectiveTiers(userId)
    return PLAN_ENTITLEMENTS.form[tiers.form]
}

/**
 * Get the highest paid tier a user has across any product.
 */
export function getEffectiveTier(user?: UserSub | null): 'free' | PaidTier {
    if (!user?.subscriptions) return 'free'
    let best: 'free' | PaidTier = 'free'
    for (const sub of user.subscriptions) {
        if (!isActive(sub)) continue
        if (sub.tier !== 'plus' && sub.tier !== 'pro') continue
        best = higherTier(best, sub.tier as PaidTier)
    }
    return best
}

/**
 * Get recipient limit for a user based on their subscription.
 * Recipients are verified email addresses that aliases can forward to.
 */
export function getRecipientLimit(user?: UserSub | null): number {
    return getPlanLimits(user).recipients
}
