/**
 * Upload-token unit tests. These cover the security primitive guest drops
 * hinge on: token rotation per drop, mismatched-drop rejection, expiry, and
 * revocation on drop completion.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const {
    uploadTokenCreate,
    uploadTokenFindUnique,
    uploadTokenDeleteMany,
} = vi.hoisted(() => ({
    uploadTokenCreate: vi.fn(),
    uploadTokenFindUnique: vi.fn(),
    uploadTokenDeleteMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        uploadToken: {
            create: uploadTokenCreate,
            findUnique: uploadTokenFindUnique,
            deleteMany: uploadTokenDeleteMany,
        },
    },
}));

import {
    issueUploadToken,
    verifyUploadToken,
    revokeUploadTokens,
} from "@/lib/services/drop-upload-token";
import crypto from "crypto";

function sha256(raw: string): string {
    return crypto.createHash("sha256").update(raw).digest("hex");
}

function makeRequest(headers: Record<string, string> = {}): Request {
    return new Request("http://localhost/api/v1/drop/drop-123/file", { headers });
}

describe("upload-token service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("issueUploadToken returns a raw token and stores its hash", async () => {
        uploadTokenCreate.mockResolvedValue(undefined);
        const raw = await issueUploadToken("drop-abc");

        expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(raw.length).toBeGreaterThan(20);
        expect(uploadTokenCreate).toHaveBeenCalledTimes(1);

        const args = uploadTokenCreate.mock.calls[0]?.[0];
        if (!args) throw new Error("upload token create was not called");
        expect(args.data.dropId).toBe("drop-abc");
        expect(args.data.tokenHash).toBe(sha256(raw));
        expect(args.data.tokenHash).not.toBe(raw);
        expect(args.data.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it("verifyUploadToken rejects requests missing the header", async () => {
        const ok = await verifyUploadToken(makeRequest(), "drop-123");
        expect(ok).toBe(false);
        expect(uploadTokenFindUnique).not.toHaveBeenCalled();
    });

    it("verifyUploadToken rejects unknown tokens", async () => {
        uploadTokenFindUnique.mockResolvedValue(null);
        const ok = await verifyUploadToken(
            makeRequest({ "x-upload-token": "bogus" }),
            "drop-123",
        );
        expect(ok).toBe(false);
    });

    it("verifyUploadToken rejects tokens bound to a different drop", async () => {
        const raw = "raw-token-value";
        uploadTokenFindUnique.mockResolvedValue({
            dropId: "drop-OTHER",
            tokenHash: sha256(raw),
            expiresAt: new Date(Date.now() + 60_000),
        });
        const ok = await verifyUploadToken(
            makeRequest({ "x-upload-token": raw }),
            "drop-123",
        );
        expect(ok).toBe(false);
    });

    it("verifyUploadToken rejects expired tokens", async () => {
        const raw = "raw-token-value";
        uploadTokenFindUnique.mockResolvedValue({
            dropId: "drop-123",
            tokenHash: sha256(raw),
            expiresAt: new Date(Date.now() - 1_000),
        });
        const ok = await verifyUploadToken(
            makeRequest({ "x-upload-token": raw }),
            "drop-123",
        );
        expect(ok).toBe(false);
    });

    it("verifyUploadToken accepts a valid token for the matching drop", async () => {
        const raw = "raw-token-value";
        uploadTokenFindUnique.mockResolvedValue({
            dropId: "drop-123",
            tokenHash: sha256(raw),
            expiresAt: new Date(Date.now() + 60_000),
        });
        const ok = await verifyUploadToken(
            makeRequest({ "x-upload-token": raw }),
            "drop-123",
        );
        expect(ok).toBe(true);
        expect(uploadTokenFindUnique).toHaveBeenCalledWith({
            where: { tokenHash: sha256(raw) },
        });
    });

    it("revokeUploadTokens deletes all tokens for the drop", async () => {
        uploadTokenDeleteMany.mockResolvedValue({ count: 1 });
        await revokeUploadTokens("drop-xyz");
        expect(uploadTokenDeleteMany).toHaveBeenCalledWith({
            where: { dropId: "drop-xyz" },
        });
    });
});
