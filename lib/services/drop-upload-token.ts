/**
 * Upload tokens bind an in-flight guest drop to the browser that created it.
 * No cookie — the raw token is returned once from POST /api/v1/drop and the
 * client echoes it via the X-Upload-Token header on subsequent writes. At rest
 * we only store the SHA-256 hash, so a DB leak does not expose live tokens.
 */

import crypto from "crypto";
import { prisma } from "@/lib/prisma";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export function hashUploadToken(raw: string): string {
    return crypto.createHash("sha256").update(raw).digest("hex");
}

export async function issueUploadToken(dropId: string): Promise<string> {
    const raw = crypto.randomBytes(32).toString("base64url");
    const tokenHash = hashUploadToken(raw);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
    await prisma.uploadToken.create({
        data: { dropId, tokenHash, expiresAt },
    });
    return raw;
}

export type ValidUploadToken = {
    id: string;
    dropId: string;
    formId: string | null;
    expiresAt: Date;
};

export async function getValidUploadToken(raw: string, dropId?: string): Promise<ValidUploadToken | null> {
    const tokenHash = hashUploadToken(raw);
    const record = await prisma.uploadToken.findUnique({
        where: { tokenHash },
        select: {
            id: true,
            dropId: true,
            formId: true,
            expiresAt: true,
        },
    });

    if (!record) return null;
    if (dropId && record.dropId !== dropId) return null;
    if (record.expiresAt.getTime() <= Date.now()) return null;

    return record;
}

export async function getValidUploadTokenForRequest(request: Request, dropId?: string): Promise<ValidUploadToken | null> {
    const raw = request.headers.get("x-upload-token");
    if (!raw) return null;
    return getValidUploadToken(raw, dropId);
}

export async function verifyUploadToken(request: Request, dropId: string): Promise<boolean> {
    return (await getValidUploadTokenForRequest(request, dropId)) !== null;
}

export async function revokeUploadTokens(dropId: string): Promise<void> {
    await prisma.uploadToken.deleteMany({ where: { dropId } });
}
