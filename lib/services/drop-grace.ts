import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { DAY_MS } from "@/lib/constants"

/**
 * Undo the billing-loss grace expiry on drops after a subscription recovers.
 *
 * Only a drop whose expiry still equals its grace marker is touched (an expiry
 * the owner set since is kept), and only standalone drops (Form attachments
 * are never stamped). What the drop gets back depends on the plan now in
 * force (`maxExpiryDays` from getDropLimits):
 *  - unlimited expiry (-1): the drop is unlimited again;
 *  - otherwise: the plan's longest expiry from now (never shorter than the
 *    grace already granted) — a paying customer is not left with a few-day
 *    grace that ends in deletion, but no plan limit is exceeded.
 * The marker is cleared and expiryNotifiedAt reset so the owner is warned
 * again before the new expiry.
 *
 * `ownerFilter` scopes the update (personal: userId + organizationId IS NULL;
 * org: organizationId). Resolves to the number of restored drops; usable in a
 * batch transaction.
 */
export function restoreGraceStampedDrops(ownerFilter: Prisma.Sql, maxExpiryDays: number): Prisma.PrismaPromise<number> {
    const restoredExpiry = maxExpiryDays === -1
        ? Prisma.sql`NULL`
        : Prisma.sql`GREATEST("expiresAt", ${new Date(Date.now() + maxExpiryDays * DAY_MS)})`

    return prisma.$executeRaw`
        UPDATE "drops"
        SET "expiresAt" = CASE
                WHEN "expiresAt" = "billing_grace_expires_at" THEN ${restoredExpiry}
                ELSE "expiresAt"
            END,
            "expiryNotifiedAt" = CASE
                WHEN "expiresAt" = "billing_grace_expires_at" THEN NULL
                ELSE "expiryNotifiedAt"
            END,
            "billing_grace_expires_at" = NULL
        WHERE ${ownerFilter}
          AND "billing_grace_expires_at" IS NOT NULL
          AND "deletedAt" IS NULL
          AND "form_staging_id" IS NULL
          AND NOT EXISTS (SELECT 1 FROM "form_submissions" fs WHERE fs."attachedDropId" = "drops"."id")
          AND NOT EXISTS (SELECT 1 FROM "upload_tokens" ut WHERE ut."dropId" = "drops"."id" AND ut."formId" IS NOT NULL)
    `
}
