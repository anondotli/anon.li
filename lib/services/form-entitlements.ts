import "server-only"

import { getOrgLimitContext } from "@/lib/data/auth"
import { getEffectiveTier } from "@/lib/limits"
import { getEffectiveTiers } from "@/lib/entitlements"
import { PLAN_ENTITLEMENTS, type FormEntitlements } from "@/config/plans"

/**
 * Resolve a form's entitlements (tier + limits) from the RIGHT owner scope.
 *
 * An org-owned form (organizationId set) must derive its tier/limits from the
 * ORGANIZATION's plan — NOT from the creating user. Resolving from the creator
 * silently degraded org forms to free caps (and, worse, 0-day submission
 * retention) the moment the creator left the org or deleted their account
 * (userId → NULL). Personal forms continue to resolve from the user. Mirrors the
 * org-limit pattern Drop/Alias/Recipient already use via getOrgLimitContext.
 */

type FormTier = "free" | "plus" | "pro"
type DropTier = "free" | "plus" | "pro"

export interface FormOwnerRef {
    userId: string | null
    organizationId: string | null
}

/**
 * Resolved form owner entitlements. `tiers.form` drives form caps; `tiers.drop`
 * drives the attached-submission drop storage limit (getFormUploadQuotaOverride).
 * For an org-owned form both derive from the org's (Business → Pro) plan.
 *
 * `subscribed` is the purchase-first Teams gate: false only for an org with no
 * active Business subscription (a zero-capacity workspace). Personal owners are
 * always `subscribed` (free personal accounts keep their own caps). Callers that
 * create resources (FormService.createForm) reject when !subscribed; read paths
 * ignore it.
 */
export async function getFormOwnerEntitlements(
    owner: FormOwnerRef,
): Promise<{ limits: FormEntitlements; tiers: { form: FormTier; drop: DropTier }; subscribed: boolean }> {
    if (owner.organizationId) {
        const orgCtx = await getOrgLimitContext(owner.organizationId)
        // Org plans (Business) grant a single tier across all products.
        const tier = getEffectiveTier(orgCtx) as FormTier
        return {
            limits: PLAN_ENTITLEMENTS.form[tier],
            tiers: { form: tier, drop: tier },
            subscribed: orgCtx.subscriptions.length > 0,
        }
    }
    const tiers = await getEffectiveTiers(owner.userId)
    return { limits: PLAN_ENTITLEMENTS.form[tiers.form], tiers: { form: tiers.form, drop: tiers.drop }, subscribed: true }
}
