/**
 * Guest-upload integration tests. Exercise the POST /api/v1/drop guest branch
 * and the X-Upload-Token gate on the file-write routes, covering:
 *   - guest create returns a single-use upload_token
 *   - authenticated create does NOT return an upload_token
 *   - guest create rejects an ownerKey payload
 *   - add-file rejects missing / wrong / cross-drop tokens
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const issueUploadTokenMock = vi.fn();
const verifyUploadTokenMock = vi.fn();
const revokeUploadTokensMock = vi.fn();
const resolveTokenUploadAccessMock = vi.fn();
const validateFormDropFileMock = vi.fn();
const getTurnstileErrorMock = vi.fn();

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/resend", () => ({
    getResendClient: vi.fn(),
    sendWelcomeEmail: vi.fn(),
    sendSubscriptionCanceledEmail: vi.fn(),
    sendPaymentActionRequiredEmail: vi.fn(),
    sendFileExpiringEmail: vi.fn(),
    sendDropExpiringEmail: vi.fn(),
    sendDownloadLimitReachedEmail: vi.fn(),
    sendDomainDeletedEmail: vi.fn(),
    sendDomainUnverifiedEmail: vi.fn(),
    sendMagicLinkEmail: vi.fn(),
    sendEmail: vi.fn(),
    sendRecipientVerificationEmail: vi.fn(),
    sendDowngradeWarningEmail: vi.fn(),
    sendResourcesScheduledForRemovalEmail: vi.fn(),
    sendResourcesDeletedEmail: vi.fn(),
    sendCryptoPaymentConfirmationEmail: vi.fn(),
    sendCryptoRenewalReminderEmail: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
    rateLimit: vi.fn().mockResolvedValue(null),
    getClientIp: vi.fn().mockResolvedValue("127.0.0.1"),
    rateLimiters: {},
    monthlyApiLimiters: {
        dropFree: null,
        dropPlus: null,
        dropPro: null,
    },
}));
vi.mock("@/lib/services/drop", () => ({
    DropService: {
        createDrop: vi.fn(),
        addFile: vi.fn(),
    },
}));
vi.mock("@/lib/services/drop-upload-token", () => ({
    issueUploadToken: issueUploadTokenMock,
    verifyUploadToken: verifyUploadTokenMock,
    revokeUploadTokens: revokeUploadTokensMock,
}));
vi.mock("@/lib/services/form-upload", () => ({
    resolveTokenUploadAccess: resolveTokenUploadAccessMock,
    validateFormDropFile: validateFormDropFileMock,
}));
vi.mock("@/lib/turnstile", () => ({
    getTurnstileError: getTurnstileErrorMock,
}));
vi.mock("@/lib/storage", () => ({
    abortMultipartUpload: vi.fn(),
    getChunkPresignedUrls: vi.fn().mockResolvedValue({}),
    getPresignedDownloadUrl: vi.fn(),
}));
vi.mock("@/lib/csrf", () => ({ validateCsrf: vi.fn() }));
vi.mock("@/lib/data/auth", () => ({
    getAuthUserState: vi.fn().mockResolvedValue(null),
    getAuthApiKeyRecord: vi.fn().mockResolvedValue(null),
    touchApiKeyLastUsed: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/vault/drop-owner-keys", () => ({
    DropOwnerKeyConflictError: class DropOwnerKeyConflictError extends Error {},
    persistOwnedDropKey: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
    prisma: {
        user: { findUnique: vi.fn() },
        userSecurity: { findUnique: vi.fn() },
        drop: { deleteMany: vi.fn() },
    },
}));
vi.mock("@/lib/api-rate-limit", () => ({
    checkApiQuota: vi.fn().mockResolvedValue({
        success: true,
        limit: 500,
        remaining: 499,
        reset: new Date(),
    }),
    checkApiRateLimit: vi.fn().mockResolvedValue({
        success: true,
        limit: 500,
        remaining: 499,
        reset: new Date(),
    }),
    checkDropApiRateLimit: vi.fn().mockResolvedValue({
        success: true,
        limit: 500,
        remaining: 499,
        reset: new Date(),
    }),
    createRateLimitHeaders: vi.fn().mockReturnValue(new Headers()),
}));
vi.mock("@/lib/limits", () => ({
    getDropLimits: vi.fn().mockReturnValue({
        maxStorage: 5 * 1024 * 1024 * 1024,
        maxExpiry: 3,
        downloadLimits: true,
        features: {},
    }),
}));

import { auth } from "@/auth";
import { DropService } from "@/lib/services/drop";

const validDropBody = {
    iv: "AAAAAAAAAAAAAAAA",
    fileCount: 1,
};

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
    return new Request("http://localhost/api/v1/drop", {
        method: "POST",
        body: JSON.stringify(body),
        headers: {
            "content-type": "application/json",
            origin: "http://localhost",
            ...headers,
        },
    });
}

describe("POST /api/v1/drop guest branch", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (DropService.createDrop as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            dropId: "drop-new",
            expiresAt: new Date("2026-04-22T00:00:00Z"),
        });
        getTurnstileErrorMock.mockResolvedValue(null);
    });

    it("returns an upload_token when no session is present", async () => {
        (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
        issueUploadTokenMock.mockResolvedValue("raw-guest-token");

        const { POST } = await import("@/app/api/v1/drop/route");
        const response = await POST(makeRequest(validDropBody));

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.data.drop_id).toBe("drop-new");
        expect(body.data.upload_token).toBe("raw-guest-token");
        expect(body.data.owner_key_stored).toBe(false);
        expect(issueUploadTokenMock).toHaveBeenCalledWith("drop-new");
        expect(DropService.createDrop).toHaveBeenCalledWith(null, expect.objectContaining({
            iv: validDropBody.iv,
        }));
    });

    it("rejects guest create when turnstile validation fails", async () => {
        (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
        getTurnstileErrorMock.mockResolvedValueOnce("Verification required. Please complete the challenge.");

        const { POST } = await import("@/app/api/v1/drop/route");
        const response = await POST(makeRequest(validDropBody));

        expect(response.status).toBe(400);
        expect(getTurnstileErrorMock).toHaveBeenCalledWith(undefined);
        expect(DropService.createDrop).not.toHaveBeenCalled();
        expect(issueUploadTokenMock).not.toHaveBeenCalled();
    });

    it("passes the guest turnstile token to validation before creating a drop", async () => {
        (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
        issueUploadTokenMock.mockResolvedValue("raw-guest-token");

        const { POST } = await import("@/app/api/v1/drop/route");
        const response = await POST(makeRequest({
            ...validDropBody,
            turnstileToken: "captcha-token",
        }));

        expect(response.status).toBe(200);
        expect(getTurnstileErrorMock).toHaveBeenCalledWith("captcha-token");
        expect(DropService.createDrop).toHaveBeenCalledWith(null, expect.objectContaining({
            iv: validDropBody.iv,
        }));
    });

    it("does not return an upload_token for authenticated callers", async () => {
        (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            user: { id: "user-123" },
            twoFactorVerified: true,
            requires2FA: false,
        });
        const { getAuthUserState } = await import("@/lib/data/auth");
        (getAuthUserState as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: "user-123",
            banned: false,
            stripeSubscriptionId: null,
            stripePriceId: null,
            stripeCurrentPeriodEnd: null,
        });

        const { POST } = await import("@/app/api/v1/drop/route");
        const response = await POST(makeRequest(validDropBody));

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.data.upload_token).toBeNull();
        expect(issueUploadTokenMock).not.toHaveBeenCalled();
        expect(getTurnstileErrorMock).not.toHaveBeenCalled();
    });

    it("rejects an ownerKey payload from guest callers", async () => {
        (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

        const { POST } = await import("@/app/api/v1/drop/route");
        const response = await POST(makeRequest({
            ...validDropBody,
            ownerKey: {
                wrappedKey: {
                    version: 1,
                    iv: "AAAAAAAAAAAAAAAA",
                    ciphertext: "A".repeat(64),
                },
                vaultId: "00000000-0000-0000-0000-000000000000",
                vaultGeneration: 1,
            },
        }));

        expect(response.status).toBe(400);
        expect(DropService.createDrop).not.toHaveBeenCalled();
        expect(issueUploadTokenMock).not.toHaveBeenCalled();
    });
});

describe("POST /api/v1/drop/[id]/file guest branch", () => {
    const validFileBody = {
        size: 1000,
        encryptedName: "test",
        iv: "1234567890123456",
        mimeType: "text/plain",
        chunkCount: 1,
        chunkSize: 1000,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        (DropService.addFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            fileId: "file-new",
            s3UploadId: "s3-id",
            storageKey: "key",
        });
    });

    function makeFileRequest(body: unknown, headers: Record<string, string> = {}): Request {
        return new Request("http://localhost/api/v1/drop/drop-123/file", {
            method: "POST",
            body: JSON.stringify(body),
            headers: {
                "content-type": "application/json",
                origin: "http://localhost",
                ...headers,
            },
        });
    }

    it("rejects guest add-file without an X-Upload-Token header", async () => {
        (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
        resolveTokenUploadAccessMock.mockResolvedValue(null);

        const { POST } = await import("@/app/api/v1/drop/[id]/file/route");
        const response = await POST(
            makeFileRequest(validFileBody),
            { params: Promise.resolve({ id: "drop-123" }) },
        );

        expect(response.status).toBe(401);
        expect(DropService.addFile).not.toHaveBeenCalled();
    });

    it("rejects guest add-file when verifyUploadToken returns false", async () => {
        (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
        resolveTokenUploadAccessMock.mockResolvedValue(null);

        const { POST } = await import("@/app/api/v1/drop/[id]/file/route");
        const response = await POST(
            makeFileRequest(validFileBody, { "x-upload-token": "bad-token" }),
            { params: Promise.resolve({ id: "drop-123" }) },
        );

        expect(response.status).toBe(401);
        expect(resolveTokenUploadAccessMock).toHaveBeenCalled();
        expect(DropService.addFile).not.toHaveBeenCalled();
    });

    it("accepts guest add-file with a valid X-Upload-Token and passes null userId", async () => {
        (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
        resolveTokenUploadAccessMock.mockResolvedValue({ mode: "guest", effectiveUserId: null, formId: null });

        const { POST } = await import("@/app/api/v1/drop/[id]/file/route");
        const response = await POST(
            makeFileRequest(validFileBody, { "x-upload-token": "good-token" }),
            { params: Promise.resolve({ id: "drop-123" }) },
        );

        expect(response.status).toBe(200);
        expect(DropService.addFile).toHaveBeenCalledWith(
            null,
            expect.objectContaining({ dropId: "drop-123" }),
        );
    });
});
