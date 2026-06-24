/**
 * Per-recipient access tokens + access logging for Drop.
 *
 * A drop can be shared with named recipients. Each recipient gets a unique,
 * crypto-random access token; only its SHA-256 hash is stored, so a DB leak does
 * not expose live tokens (same scheme as drop-upload-token.ts).
 *
 * ZERO-KNOWLEDGE: the access token gates the server's release of a presigned
 * download URL. It does NOT carry the AES decryption key — that lives only in the
 * URL fragment (`#...`) and never reaches the server. Revoking or logging a
 * recipient therefore controls access to ciphertext; the server never decrypts.
 */

import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { hashIp } from "@/lib/ip-hash";
import { createLogger } from "@/lib/logger";

const logger = createLogger("DropRecipient");

export function hashRecipientToken(raw: string): string {
    return crypto.createHash("sha256").update(raw).digest("hex");
}

export function generateRecipientToken(): { raw: string; tokenHash: string } {
    const raw = crypto.randomBytes(32).toString("base64url");
    return { raw, tokenHash: hashRecipientToken(raw) };
}

export type ValidRecipient = {
    id: string;
    dropId: string;
    email: string;
    requireVerification: boolean;
};

/**
 * Validate a raw recipient access token against a drop. Returns the recipient
 * when the token exists, belongs to this drop, is not revoked, not expired, and
 * is under its per-recipient download cap. Otherwise null.
 *
 * This only checks eligibility; the atomic cap consumption happens in
 * consumeRecipientDownload so concurrent downloads can't exceed the cap.
 */
export async function validateRecipientAccess(
    dropId: string,
    rawToken: string,
): Promise<ValidRecipient | null> {
    if (!rawToken) return null;

    const tokenHash = hashRecipientToken(rawToken);
    const r = await prisma.dropRecipient.findUnique({
        where: { tokenHash },
        select: {
            id: true,
            dropId: true,
            email: true,
            requireVerification: true,
            revokedAt: true,
            expiresAt: true,
            maxDownloads: true,
            downloads: true,
        },
    });

    if (!r) return null;
    if (r.dropId !== dropId) return null;
    if (r.revokedAt) return null;
    if (r.expiresAt && r.expiresAt.getTime() <= Date.now()) return null;
    if (r.maxDownloads !== null && r.downloads >= r.maxDownloads) return null;

    return { id: r.id, dropId: r.dropId, email: r.email, requireVerification: r.requireVerification };
}

/**
 * Atomically consume one download against a recipient's per-recipient cap and
 * stamp lastAccessAt. Returns false when the recipient is revoked or the cap is
 * already reached. Mirrors DropService.incrementDownloadCount's guarded raw SQL
 * (Prisma updateMany can't compare two columns of the same row).
 */
export async function consumeRecipientDownload(recipientId: string): Promise<boolean> {
    const rowsAffected = await prisma.$executeRaw`
        UPDATE "drop_recipients"
        SET "downloads" = "downloads" + 1, "lastAccessAt" = NOW()
        WHERE "id" = ${recipientId}
          AND "revokedAt" IS NULL
          AND ("maxDownloads" IS NULL OR "downloads" < "maxDownloads")
    `;
    return rowsAffected > 0;
}

/**
 * Resolve whether a download is permitted and which recipient (if any) to
 * attribute it to. Shared by every download entry point (the per-file route, the
 * batch route, and the web download action).
 *
 * - A valid token always grants access and attributes the recipient.
 * - When the drop is restricted (restrictToRecipients), a missing/invalid token
 *   is denied — this is what makes per-recipient revoke meaningful.
 * - When the drop is NOT restricted, the bare anonymous link still works
 *   (recipientId null); a stale/invalid token is simply ignored.
 */
export async function resolveDownloadAccess(
    dropId: string,
    restrictToRecipients: boolean,
    rawToken: string | null | undefined,
): Promise<{ allowed: boolean; recipientId: string | null }> {
    if (rawToken) {
        const recipient = await validateRecipientAccess(dropId, rawToken);
        if (recipient) return { allowed: true, recipientId: recipient.id };
        if (restrictToRecipients) return { allowed: false, recipientId: null };
        // Non-restricted drop: ignore the bad token, fall through to anonymous.
    }
    if (restrictToRecipients) return { allowed: false, recipientId: null };
    return { allowed: true, recipientId: null };
}

export interface AccessEventInput {
    dropId: string;
    recipientId?: string | null;
    fileId?: string | null;
    eventType: "download" | "zip_all" | "view";
    ip?: string | null;
    userAgent?: string | null;
}

/**
 * Record a per-download access event for a drop's owner-facing access log.
 * Fire-and-forget — callers should not await (mirrors lib/services/audit.ts).
 * The IP is peppered-hashed via the shared helper and never stored raw.
 */
export async function recordAccessEvent(input: AccessEventInput): Promise<void> {
    try {
        await prisma.dropAccessEvent.create({
            data: {
                dropId: input.dropId,
                recipientId: input.recipientId ?? null,
                fileId: input.fileId ?? null,
                eventType: input.eventType,
                ipHash: input.ip ? hashIp(input.ip) : null,
                userAgent: input.userAgent ? input.userAgent.slice(0, 512) : null,
            },
        });
    } catch (error) {
        // Access logging must never break a download.
        logger.error("Failed to record drop access event", error);
    }
}
