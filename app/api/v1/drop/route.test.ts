/**
 * Tests for Drop API route limits
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies MUST be defined before imports that use them
// For Bun compatibility, avoid vi.hoisted() and use inline functions
vi.mock("next/navigation", () => ({
    redirect: vi.fn(),
    useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() })),
    usePathname: vi.fn(() => "/"),
    useSearchParams: vi.fn(() => new URLSearchParams()),
    notFound: vi.fn(),
    permanentRedirect: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        user: {
            findUnique: vi.fn(),
        },
        drop: {
            findMany: vi.fn(),
            count: vi.fn(),
        },
    },
}));

vi.mock("@/auth", () => ({
    auth: vi.fn(),
}));

vi.mock("@/lib/data/auth", () => ({
    getAuthUserState: vi.fn().mockResolvedValue({
        id: "user-123",
        isAdmin: false,
        banned: false,
        stripeSubscriptionId: null,
        stripePriceId: "price_123",
        stripeCurrentPeriodEnd: new Date(),
    }),
    getAuthApiKeyRecord: vi.fn().mockResolvedValue(null),
    touchApiKeyLastUsed: vi.fn().mockResolvedValue(undefined),
}));

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

vi.mock("@/lib/services/drop", () => ({
    DropService: {
        listDrops: vi.fn().mockResolvedValue({ drops: [], total: 0 }),
        createDrop: vi.fn(),
    },
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
    enforceMonthlyQuota: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import * as limits from "@/lib/limits";

describe("GET /api/v1/drop limits", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should return limit from getDropLimits", async () => {
        // Dynamic import to ensure mocks are applied
        const { GET } = await import("./route");

        // Mock authenticated user
        (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            user: { id: "user-123" },
        });

        // Mock DB return
        (prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            storageUsed: BigInt(100),
            stripePriceId: "price_123",
            stripeCurrentPeriodEnd: new Date(),
        });

        // Spy on limits
        const getDropLimitsSpy = vi.spyOn(limits, "getDropLimits");
        getDropLimitsSpy.mockReturnValue({
            maxStorage: 999999,
            maxFileSize: 999999,
            maxExpiry: 7,
            downloadLimits: true,
            features: {
                customKey: true,
                downloadLimits: true,
                noBranding: false,
                downloadNotifications: false,
                filePreview: true,
            }
        });

        const request = new Request("http://localhost/api/v1/drop");
        const response = await GET(request);
        const data = await response.json();

        // Verify it passes user data to getDropLimits
        expect(limits.getDropLimits).toHaveBeenCalledWith(expect.objectContaining({
            stripePriceId: "price_123"
        }));

        // Verify it returns the mocked limit (apiList puts additional meta under `meta`)
        expect(data.meta.storage.limit).toBe("999999");
        expect(data.meta.storage.used).toBe("100");
    });
});

describe("POST /api/v1/drop validation", () => {
    const validUrl = "http://localhost";
    let originalAppUrl: string | undefined;

    beforeEach(() => {
        vi.clearAllMocks();
        originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
        process.env.NEXT_PUBLIC_APP_URL = validUrl;
    });

    afterEach(() => {
        if (originalAppUrl === undefined) {
            delete process.env.NEXT_PUBLIC_APP_URL;
        } else {
            process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
        }
    });

    it("should fail if customKey is true but missing crypto fields", async () => {
        const { POST } = await import("./route");

        // Mock authenticated user
        (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            user: { id: "user-123" },
        });

        const body = {
            iv: "1234567890123456", // 16 chars
            fileCount: 1,
            customKey: true,
            // Missing salt, key, iv
        };

        const request = new Request("http://localhost/api/v1/drop", {
            method: "POST",
            body: JSON.stringify(body),
            headers: { Origin: validUrl }
        });

        const response = await POST(request);
        expect(response.status).toBe(400);

        const data = await response.json();
        expect(data.error.message).toBe("Validation failed");
        expect(data.error.code).toBe("VALIDATION_ERROR");
    });

    it("should succeed with valid custom key fields", async () => {
        const { POST } = await import("./route");

        // Mock authenticated user
        (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            user: { id: "user-123" },
        });

        // Mock DropService.createDrop
        const mockCreateDrop = vi.fn().mockResolvedValue({
            dropId: "drop-123",
            sessionToken: null,
            expiresAt: new Date()
        });

        const { DropService } = await import("@/lib/services/drop");
        DropService.createDrop = mockCreateDrop;

        const body = {
            iv: "1234567890123456",
            fileCount: 1,
            customKey: true,
            salt: "a".repeat(43),
            customKeyData: "a".repeat(79), // ~79 chars for password-encrypted key (base64url)
            customKeyIv: "1234567890123456",
        };

        const request = new Request("http://localhost/api/v1/drop", {
            method: "POST",
            body: JSON.stringify(body),
            headers: { Origin: validUrl }
        });

        const response = await POST(request);
        expect(response.status).toBe(200);
        expect(mockCreateDrop).toHaveBeenCalled();
    });

    it("should succeed with valid public drop fields", async () => {
        const { POST } = await import("./route");

        // Mock authenticated user
        (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            user: { id: "user-123" },
        });

        const { DropService } = await import("@/lib/services/drop");
        DropService.createDrop = vi.fn().mockResolvedValue({
            dropId: "drop-public",
            sessionToken: null,
            expiresAt: new Date()
        });

        const body = {
            iv: "1234567890123456",
            fileCount: 1,
            customKey: false,
        };

        const request = new Request("http://localhost/api/v1/drop", {
            method: "POST",
            body: JSON.stringify(body),
            headers: { Origin: validUrl }
        });

        const response = await POST(request);
        expect(response.status).toBe(200);
    });

    it("should fail if encryptedTitle is too long", async () => {
        const { POST } = await import("./route");

        // Mock authenticated user
        (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            user: { id: "user-123" },
        });

        const body = {
            iv: "1234567890123456",
            fileCount: 1,
            encryptedTitle: "a".repeat(1025), // 1024 limit
        };

        const request = new Request("http://localhost/api/v1/drop", {
            method: "POST",
            body: JSON.stringify(body),
            headers: { Origin: validUrl }
        });

        const response = await POST(request);
        expect(response.status).toBe(400);

        const data = await response.json();
        expect(data.error.message).toBe("Validation failed");
        expect(data.error.details.some((d: { field: string }) => d.field === "encryptedTitle")).toBe(true);
    });
});
