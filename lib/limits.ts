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
import { UpgradeRequiredError, type UpgradeRequiredDetails } from "@/lib/api-error-utils"

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
// referralPlusUntil grants complimentary Plus across all products until it lapses.
// Optional so existing callers compile; selects that omit it simply won't apply
// the referral bump (graceful degradation, never an over-grant).
export type UserSub = { subscriptions?: SubscriptionLike[] | null; referralPlusUntil?: Date | null }

const TIER_RANK: Record<string, number> = { free: 0, plus: 1, pro: 2 }

function isActive(sub: SubscriptionLike): boolean {
    if (sub.status !== "active" && sub.status !== "trialing") return false
    if (sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() + DAY_MS < Date.now()) return false
    return true
}

function hasActiveReferralPlus(user?: UserSub | null): boolean {
    return Boolean(user?.referralPlusUntil && user.referralPlusUntil.getTime() > Date.now())
}

function higherTier(a: 'free' | PaidTier, b: 'free' | PaidTier): 'free' | PaidTier {
    return (TIER_RANK[a] ?? 0) >= (TIER_RANK[b] ?? 0) ? a : b
}

function resolveTierForProduct(user: UserSub | null | undefined, product: Product): 'free' | PaidTier {
    let best: 'free' | PaidTier = 'free'
    for (const sub of user?.subscriptions ?? []) {
        if (!isActive(sub)) continue
        if (sub.tier !== 'plus' && sub.tier !== 'pro') continue
        // bundle and business both grant their tier across every product.
        if (sub.product !== 'bundle' && sub.product !== 'business' && sub.product !== product) continue
        best = higherTier(best, sub.tier as PaidTier)
    }
    // Referral Plus tops up to at least Plus, never downgrading a paid Pro.
    if (hasActiveReferralPlus(user)) best = higherTier(best, 'plus')
    return best
}

export function getPlanLimits(user?: UserSub | null): AliasEntitlements {
    const tier = resolveTierForProduct(user, 'alias')
    return tier === 'free' ? ALIAS_LIMITS.free : ALIAS_LIMITS[tier]
}

/**
 * Purchase-first Teams gate. An org with no active Business subscription is a
 * zero-capacity workspace: members create and manage resources on their personal
 * account until the team subscribes. Call this in the ORG branch of every
 * resource-creation path (alias/recipient/domain/drop/form) before checking the
 * numeric limit — getOrgLimitContext returns an empty `subscriptions` array for a
 * free team, which is the exact "no active Business plan" signal.
 */
export function assertOrgPlanActive(
    orgCtx: { subscriptions: unknown[] },
    resourceLabel: string,
    scope: UpgradeRequiredDetails["scope"],
): void {
    if (orgCtx.subscriptions.length === 0) {
        throw new UpgradeRequiredError(
            `Your team needs a Business subscription to create team ${resourceLabel}. ` +
                `Subscribe from the Team page, or switch to your personal account to manage your own.`,
            { scope, currentTier: "free", suggestedTier: "pro" },
        )
    }
}

/**
 * Get alias limits formatted for user-facing surfaces.
 * Pro random aliases are intentionally displayed as unlimited even though
 * enforcement uses a hidden high cap.
 */
export function getDisplayPlanLimits(user?: UserSub | null): AliasEntitlements {
    return getPlanLimits(user)
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

export async function getFormLimitsAsync(userId: string | null): Promise<FormEntitlements> {
    const { getEffectiveTiers } = await import("@/lib/entitlements")
    const tiers = await getEffectiveTiers(userId)
    return PLAN_ENTITLEMENTS.form[tiers.form]
}

/**
 * Get the highest paid tier a user has across any product.
 */
export function getEffectiveTier(user?: UserSub | null): 'free' | PaidTier {
    let best: 'free' | PaidTier = 'free'
    for (const sub of user?.subscriptions ?? []) {
        if (!isActive(sub)) continue
        if (sub.tier !== 'plus' && sub.tier !== 'pro') continue
        best = higherTier(best, sub.tier as PaidTier)
    }
    if (hasActiveReferralPlus(user)) best = higherTier(best, 'plus')
    return best
}

/**
 * Get recipient limit for a user based on their subscription.
 * Recipients are verified email addresses that aliases can forward to.
 */
export function getRecipientLimit(user?: UserSub | null): number {
    return getPlanLimits(user).recipients
}
