/**
 * Recipient access-control unit tests. These cover the zero-knowledge access
 * gate: token validation, the restricted/anonymous decision matrix, the atomic
 * per-recipient download cap, and access-event logging (with hashed IP).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

const {
    recipientFindUnique,
    accessEventCreate,
    executeRaw,
} = vi.hoisted(() => ({
    recipientFindUnique: vi.fn(),
    accessEventCreate: vi.fn(),
    executeRaw: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        dropRecipient: { findUnique: recipientFindUnique },
        dropAccessEvent: { create: accessEventCreate },
        $executeRaw: executeRaw,
    },
}));

import {
    hashRecipientToken,
    generateRecipientToken,
    validateRecipientAccess,
    resolveDownloadAccess,
    consumeRecipientDownload,
    recordAccessEvent,
} from "@/lib/services/drop-recipient";

function sha256(raw: string): string {
    return crypto.createHash("sha256").update(raw).digest("hex");
}

// A recipient row that passes all eligibility checks unless overridden.
function validRow(overrides: Record<string, unknown> = {}) {
    return {
        id: "rec-1",
        dropId: "drop-123",
        email: "a@example.com",
        requireVerification: false,
        revokedAt: null,
        expiresAt: null,
        maxDownloads: null,
        downloads: 0,
        ...overrides,
    };
}

describe("recipient token helpers", () => {
    it("hashRecipientToken is sha256 hex of the raw token", () => {
        expect(hashRecipientToken("abc")).toBe(sha256("abc"));
    });

    it("generateRecipientToken returns a random raw token + matching hash", () => {
        const a = generateRecipientToken();
        const b = generateRecipientToken();
        expect(a.raw).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(a.raw.length).toBeGreaterThan(20);
        expect(a.tokenHash).toBe(sha256(a.raw));
        expect(a.raw).not.toBe(b.raw); // unique per call
    });
});

describe("validateRecipientAccess", () => {
    beforeEach(() => vi.clearAllMocks());

    it("returns null for an empty token without hitting the DB", async () => {
        expect(await validateRecipientAccess("drop-123", "")).toBeNull();
        expect(recipientFindUnique).not.toHaveBeenCalled();
    });

    it("looks up by token HASH, never the raw token", async () => {
        recipientFindUnique.mockResolvedValue(validRow());
        await validateRecipientAccess("drop-123", "raw-token");
        expect(recipientFindUnique).toHaveBeenCalledWith(
            expect.objectContaining({ where: { tokenHash: sha256("raw-token") } }),
        );
    });

    it("accepts a valid, eligible recipient", async () => {
        recipientFindUnique.mockResolvedValue(validRow());
        expect(await validateRecipientAccess("drop-123", "raw")).toMatchObject({
            id: "rec-1",
            dropId: "drop-123",
        });
    });

    it("rejects unknown tokens", async () => {
        recipientFindUnique.mockResolvedValue(null);
        expect(await validateRecipientAccess("drop-123", "raw")).toBeNull();
    });

    it("rejects a token bound to a different drop", async () => {
        recipientFindUnique.mockResolvedValue(validRow({ dropId: "drop-OTHER" }));
        expect(await validateRecipientAccess("drop-123", "raw")).toBeNull();
    });

    it("rejects revoked recipients", async () => {
        recipientFindUnique.mockResolvedValue(validRow({ revokedAt: new Date() }));
        expect(await validateRecipientAccess("drop-123", "raw")).toBeNull();
    });

    it("rejects expired recipients", async () => {
        recipientFindUnique.mockResolvedValue(validRow({ expiresAt: new Date(Date.now() - 1000) }));
        expect(await validateRecipientAccess("drop-123", "raw")).toBeNull();
    });

    it("rejects recipients at their per-recipient download cap", async () => {
        recipientFindUnique.mockResolvedValue(validRow({ maxDownloads: 3, downloads: 3 }));
        expect(await validateRecipientAccess("drop-123", "raw")).toBeNull();
    });
});

describe("resolveDownloadAccess (restricted vs anonymous matrix)", () => {
    beforeEach(() => vi.clearAllMocks());

    it("non-restricted, no token → anonymous access allowed", async () => {
        const r = await resolveDownloadAccess("drop-123", false, null);
        expect(r).toEqual({ allowed: true, recipientId: null });
        expect(recipientFindUnique).not.toHaveBeenCalled();
    });

    it("non-restricted, valid token → allowed and attributed to the recipient", async () => {
        recipientFindUnique.mockResolvedValue(validRow());
        const r = await resolveDownloadAccess("drop-123", false, "raw");
        expect(r).toEqual({ allowed: true, recipientId: "rec-1" });
    });

    it("non-restricted, invalid token → falls back to anonymous (token ignored)", async () => {
        recipientFindUnique.mockResolvedValue(null);
        const r = await resolveDownloadAccess("drop-123", false, "bogus");
        expect(r).toEqual({ allowed: true, recipientId: null });
    });

    it("restricted, no token → denied", async () => {
        const r = await resolveDownloadAccess("drop-123", true, null);
        expect(r).toEqual({ allowed: false, recipientId: null });
    });

    it("restricted, invalid/revoked token → denied", async () => {
        recipientFindUnique.mockResolvedValue(validRow({ revokedAt: new Date() }));
        const r = await resolveDownloadAccess("drop-123", true, "raw");
        expect(r).toEqual({ allowed: false, recipientId: null });
    });

    it("restricted, valid token → allowed", async () => {
        recipientFindUnique.mockResolvedValue(validRow());
        const r = await resolveDownloadAccess("drop-123", true, "raw");
        expect(r).toEqual({ allowed: true, recipientId: "rec-1" });
    });
});

describe("consumeRecipientDownload (atomic cap)", () => {
    beforeEach(() => vi.clearAllMocks());

    it("returns true when a row is updated (under cap)", async () => {
        executeRaw.mockResolvedValue(1);
        expect(await consumeRecipientDownload("rec-1")).toBe(true);
    });

    it("returns false when no row is updated (revoked or cap reached)", async () => {
        executeRaw.mockResolvedValue(0);
        expect(await consumeRecipientDownload("rec-1")).toBe(false);
    });
});

describe("recordAccessEvent", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.IP_HASH_PEPPER = "test-pepper";
    });

    it("stores a hashed IP (never the raw IP) and truncates the user agent", async () => {
        accessEventCreate.mockResolvedValue({});
        await recordAccessEvent({
            dropId: "drop-123",
            recipientId: "rec-1",
            fileId: "file-1",
            eventType: "download",
            ip: "203.0.113.7",
            userAgent: "x".repeat(1000),
        });

        const data = accessEventCreate.mock.calls[0]?.[0]?.data;
        expect(data.ipHash).toBe(sha256(`203.0.113.7test-pepper`));
        expect(data.ipHash).not.toBe("203.0.113.7");
        expect(data.userAgent.length).toBe(512);
        expect(data.eventType).toBe("download");
        expect(data.recipientId).toBe("rec-1");
    });

    it("stores null ipHash when no IP is provided", async () => {
        accessEventCreate.mockResolvedValue({});
        await recordAccessEvent({ dropId: "drop-123", eventType: "zip_all" });
        const data = accessEventCreate.mock.calls[0]?.[0]?.data;
        expect(data.ipHash).toBeNull();
        expect(data.recipientId).toBeNull();
    });

    it("never throws if the write fails (logging must not break a download)", async () => {
        accessEventCreate.mockRejectedValue(new Error("db down"));
        await expect(
            recordAccessEvent({ dropId: "drop-123", eventType: "download", ip: "1.2.3.4" }),
        ).resolves.toBeUndefined();
    });
});
