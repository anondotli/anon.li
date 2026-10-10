import "server-only"

import { prisma } from "@/lib/prisma"

/**
 * Fallback when deleting a submission's attachment drop failed but the
 * submission (or its form) is about to be deleted anyway.
 *
 * Attachment drops have no expiry of their own (the submission owns their
 * lifetime), and deleting the submission unlinks them (attachedDropId is
 * SetNull). Without this mark the drop would become a never-expiring orphan
 * that still holds the owner's storage. Soft-deleting hides it from every
 * owner listing and download path immediately, and the soft-deleted drop
 * cleanup reaps its files and releases the quota.
 *
 * Throws if the mark cannot be written, so callers keep the submission (and
 * retry later) rather than orphaning the drop.
 */
export async function markAttachmentDropForReaping(dropId: string): Promise<void> {
    await prisma.drop.updateMany({
        where: { id: dropId, deletedAt: null },
        data: { deletedAt: new Date() },
    })
}
