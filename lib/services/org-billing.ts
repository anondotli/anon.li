import "server-only"

import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getOrgLimitContext } from "@/lib/data/auth"
import { getDropLimits } from "@/lib/limits"
import { restoreGraceStampedDrops } from "@/lib/services/drop-grace"
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
export async function handleOrgSubscriptionLoss(
    organizationId: string,
    dropGraceExpiry: Date,
    opts: { notify?: boolean } = {},
): Promise<void> {
    // Pro feature lost: unlimited org drops get a grace-period expiry. The
    // marker lets restoreOrgDropGrace undo it if the subscription recovers.
    await prisma.drop.updateMany({
        where: {
            organizationId,
            expiresAt: null,
            deletedAt: null,
            // Form attachments are unlimited by design; their lifetime is
            // owned by Form submission retention, not the Drop plan.
            formSubmission: null,
            formStagingId: null,
            uploadTokens: { none: { formId: { not: null } } },
        },
        data: { expiresAt: dropGraceExpiry, billingGraceExpiresAt: dropGraceExpiry },
    })
    await prisma.organization.updateMany({
        where: { id: organizationId, formRetentionGraceUntil: null },
        data: { formRetentionGraceUntil: dropGraceExpiry },
    })

    // Callers dedupe repeated loss signals for the same subscription; only the
    // first one notifies admins and records the audit entry.
    if (opts.notify === false) return

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

/**
 * The organization's subscription recovered: restore drops that the loss gave
 * a grace expiry, within what the org's current plan allows (see
 * restoreGraceStampedDrops). A drop whose expiry was changed since keeps it;
 * only the marker is cleared.
 */
export async function restoreOrgDropGrace(organizationId: string): Promise<number> {
    const orgCtx = await getOrgLimitContext(organizationId)
    const restored = await restoreGraceStampedDrops(
        Prisma.sql`"organizationId" = ${organizationId}`,
        getDropLimits(orgCtx).maxExpiry,
    )
    if (restored > 0) {
        logger.info("Restored org drops after subscription recovery", { organizationId, restored })
    }
    return restored
}
