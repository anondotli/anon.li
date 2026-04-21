/**
 * Upload tokens bind an in-flight guest drop to the browser that created it.
 * No cookie — the raw token is returned once from POST /api/v1/drop and the
 * client echoes it via the X-Upload-Token header on subsequent writes. At rest
 * we only store the SHA-256 hash, so a DB leak does not expose live tokens.
 */

import crypto from "crypto";
import { prisma } from "@/lib/prisma";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function hashToken(raw: string): string {
    return crypto.createHash("sha256").update(raw).digest("hex");
}

export async function issueUploadToken(dropId: string): Promise<string> {
    const raw = crypto.randomBytes(32).toString("base64url");
    const tokenHash = hashToken(raw);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
    await prisma.uploadToken.create({
        data: { dropId, tokenHash, expiresAt },
    });
    return raw;
}

export async function verifyUploadToken(request: Request, dropId: string): Promise<boolean> {
    const raw = request.headers.get("x-upload-token");
    if (!raw) return false;

    const tokenHash = hashToken(raw);
    const record = await prisma.uploadToken.findUnique({
        where: { tokenHash },
    });

    if (!record) return false;
    if (record.dropId !== dropId) return false;
    if (record.expiresAt.getTime() <= Date.now()) return false;

    return true;
}

export async function revokeUploadTokens(dropId: string): Promise<void> {
    await prisma.uploadToken.deleteMany({ where: { dropId } });
}
