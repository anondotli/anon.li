/**
 * Tests for Billing Cron Endpoint
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock prisma so the real BillingDowngradeService uses mocked DB
vi.mock("@/lib/prisma", () => ({
    prisma: {
        user: {
            findUnique: vi.fn().mockResolvedValue(null),
            findMany: vi.fn().mockResolvedValue([]),
            update: vi.fn().mockResolvedValue({}),
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        alias: {
            count: vi.fn().mockResolvedValue(0),
            findMany: vi.fn().mockResolvedValue([]),
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        domain: {
            count: vi.fn().mockResolvedValue(0),
            findMany: vi.fn().mockResolvedValue([]),
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        recipient: {
            count: vi.fn().mockResolvedValue(0),
            findMany: vi.fn().mockResolvedValue([]),
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
    },
}));

vi.mock("@/lib/resend", () => ({
    getResendClient: vi.fn(),
    sendWelcomeEmail: vi.fn().mockResolvedValue({ success: true }),
    sendSubscriptionCanceledEmail: vi.fn().mockResolvedValue({ success: true }),
    sendPaymentActionRequiredEmail: vi.fn().mockResolvedValue({ success: true }),
    sendFileExpiringEmail: vi.fn().mockResolvedValue({ success: true }),
    sendDropExpiringEmail: vi.fn().mockResolvedValue({ success: true }),
    sendDownloadLimitReachedEmail: vi.fn().mockResolvedValue({ success: true }),
    sendDomainDeletedEmail: vi.fn().mockResolvedValue({ success: true }),
    sendDomainUnverifiedEmail: vi.fn().mockResolvedValue({ success: true }),
    sendMagicLinkEmail: vi.fn().mockResolvedValue({ success: true }),
    sendEmail: vi.fn().mockResolvedValue({ success: true }),
    sendRecipientVerificationEmail: vi.fn().mockResolvedValue({ success: true }),
    sendDowngradeWarningEmail: vi.fn().mockResolvedValue({ success: true }),
    sendResourcesScheduledForRemovalEmail: vi.fn().mockResolvedValue({ success: true }),
    sendResourcesDeletedEmail: vi.fn().mockResolvedValue({ success: true }),
    sendCryptoPaymentConfirmationEmail: vi.fn().mockResolvedValue({ success: true }),
    sendCryptoRenewalReminderEmail: vi.fn().mockResolvedValue({ success: true }),
}));

import { GET, POST } from "@/app/api/cron/billing/route";

const originalEnv = process.env;

describe("Billing Cron Endpoint", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env = {
            ...originalEnv,
            CRON_SECRET: "test-cron-secret",
        };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    for (const [method, handler] of [["GET", GET], ["POST", POST]] as const) {
        describe(`${method}`, () => {
            it("should return 401 without authorization token", async () => {
                const request = new Request("http://localhost/api/cron/billing", {
                    method,
                });

                const response = await handler(request as never);
                expect(response.status).toBe(401);
            });

            it("should return 401 with invalid token", async () => {
                const request = new Request("http://localhost/api/cron/billing", {
                    method,
                    headers: {
                        Authorization: "Bearer wrong-secret",
                    },
                });

                const response = await handler(request as never);
                expect(response.status).toBe(401);
            });

            it("should return 200 with valid token and process batches", async () => {
                const request = new Request("http://localhost/api/cron/billing", {
                    method,
                    headers: {
                        Authorization: "Bearer test-cron-secret",
                    },
                });

                const response = await handler(request as never);
                expect(response.status).toBe(200);

                const body = await response.json();
                expect(body.success).toBe(true);
                expect(body.scheduling).toHaveProperty("processed");
                expect(body.scheduling).toHaveProperty("errors");
                expect(body.deletion).toHaveProperty("processed");
                expect(body.deletion).toHaveProperty("errors");
            });
        });
    }
});
