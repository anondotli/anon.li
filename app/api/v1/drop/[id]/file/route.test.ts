import { describe, it, expect, vi, beforeEach } from "vitest";

// Minimal mocks to prevent side-effects during import
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
    monthlyApiLimiters: {
        dropFree: null,
        dropPlus: null,
        dropPro: null,
    },
}));
vi.mock("@/lib/services/drop", () => ({ DropService: { addFile: vi.fn() } }));
vi.mock("@/lib/storage", () => ({ getChunkPresignedUrls: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        user: { findUnique: vi.fn() },
    },
}));

vi.mock("@/lib/api-rate-limit", () => ({
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

describe("POST /api/v1/drop/[id]/file validation", () => {
    beforeEach(() => vi.clearAllMocks());

    it("should fail if chunkCount exceeds 10000", async () => {
        const { POST } = await import("./route");
        (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "user-123" } });

        const request = new Request("http://localhost/api/v1/drop/drop-123/file", {
            method: "POST",
            body: JSON.stringify({
                size: 1000,
                encryptedName: "test",
                iv: "1234567890123456",
                mimeType: "text/plain",
                chunkCount: 10001, // Over limit
                chunkSize: 100,
            }),
        });

        const response = await POST(request, { params: Promise.resolve({ id: "drop-123" }) });

        expect(response.status).toBe(400);
        expect((await response.json()).error).toBe("Invalid request body");
    });
});
