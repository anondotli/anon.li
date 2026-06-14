import "server-only"

import { prisma } from "@/lib/prisma"
import { getOrgAdminEmails } from "@/lib/data/organization"
import { audit } from "@/lib/services/audit"
import { createLogger } from "@/lib/logger"

const logger = createLogger("OrgBilling")

/**
 * An organization's Business subscription was lost — canceled, deleted, or it
 * stopped being active after a failed payment. Member entitlements revert
 * automatically (getEffectiveTiers no longer finds an active org subscription),
 * so here we mirror the PERSONAL downgrade side-effects at the ORG scope:
 *
 *  - give the org's unlimited (Pro) Drops a grace-period expiry, and
 *  - notify the org's owners/admins (not just the billing user), and
 *  - record an org audit-trail entry.
 *
 * Distinct from the personal flow in the Stripe webhook, which would otherwise
 * only touch the billing user's personal drops and inbox.
 */
export async function handleOrgSubscriptionLoss(organizationId: string, dropGraceExpiry: Date): Promise<void> {
    // Pro feature lost: unlimited org drops get a grace-period expiry.
    await prisma.drop.updateMany({
        where: { organizationId, expiresAt: null, deletedAt: null },
        data: { expiresAt: dropGraceExpiry },
    })

    const emails = await getOrgAdminEmails(organizationId)
    if (emails.length > 0) {
        try {
            const { sendSubscriptionCanceledEmail } = await import("@/lib/resend")
            await Promise.all(emails.map((email) => sendSubscriptionCanceledEmail(email, dropGraceExpiry)))
        } catch (error) {
            // Never throw from a webhook path — Stripe would retry and re-send.
            logger.error("Failed to notify org admins of subscription loss", error, { organizationId })
        }
    }

    void audit({
        action: "org.billing.canceled",
        actorId: "system",
        organizationId,
        metadata: { dropGraceExpiry: dropGraceExpiry.toISOString() },
    })
}
