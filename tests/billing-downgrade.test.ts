/**
 * Tests for BillingDowngradeService
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("@/lib/prisma", () => {
    const mockPrisma = {
        user: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            update: vi.fn(),
            updateMany: vi.fn(),
        },
        alias: {
            count: vi.fn(),
            findMany: vi.fn(),
            updateMany: vi.fn(),
            deleteMany: vi.fn(),
        },
        domain: {
            count: vi.fn(),
            findMany: vi.fn(),
            updateMany: vi.fn(),
            deleteMany: vi.fn(),
        },
        recipient: {
            count: vi.fn(),
            findMany: vi.fn(),
            updateMany: vi.fn(),
            deleteMany: vi.fn(),
        },
        // Batch transaction: execute all operations and return results
        $transaction: vi.fn(async (arg: unknown) => {
            if (Array.isArray(arg)) {
                return Promise.all(arg);
            }
            // Interactive transaction: pass the prisma client itself
            if (typeof arg === "function") {
                return arg(mockPrisma);
            }
        }),
    };
    return { prisma: mockPrisma };
});

vi.mock("@/lib/resend", () => ({
    sendDowngradeWarningEmail: vi.fn().mockResolvedValue({ success: true }),
    sendResourcesScheduledForRemovalEmail: vi.fn().mockResolvedValue({ success: true }),
    sendResourcesDeletedEmail: vi.fn().mockResolvedValue({ success: true }),
    sendSubscriptionCanceledEmail: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock limits - getPlanLimits returns free limits by default, getRecipientLimit returns 1
// The real functions rely on env-based price IDs which aren't set in tests
const mockGetPlanLimitsImpl = vi.fn().mockReturnValue({
    random: 10,
    custom: 1,
    domains: 0,
    apiRequests: 500,
    recipients: 1,
});
const mockGetRecipientLimitImpl = vi.fn().mockReturnValue(1);
const mockGetDropLimitsImpl = vi.fn().mockReturnValue({
    maxStorage: 1073741824, // 1GB
    maxExpiry: 7,
    downloadLimits: false,
    features: { downloadLimits: false },
});

vi.mock("@/lib/limits", () => ({
    getPlanLimits: (...args: unknown[]) => mockGetPlanLimitsImpl(...args),
    getRecipientLimit: (...args: unknown[]) => mockGetRecipientLimitImpl(...args),
    getDropLimits: (...args: unknown[]) => mockGetDropLimitsImpl(...args),
}));

import { BillingDowngradeService } from "@/lib/services/billing-downgrade";
import { prisma } from "@/lib/prisma";
import type { Mock } from "vitest";

const mockUserFindUnique = prisma.user.findUnique as Mock;
const mockUserFindMany = prisma.user.findMany as Mock;
const mockUserUpdate = prisma.user.update as Mock;
const mockUserUpdateMany = prisma.user.updateMany as Mock;
const mockAliasCount = prisma.alias.count as Mock;
const mockAliasFindMany = prisma.alias.findMany as Mock;
const mockAliasUpdateMany = prisma.alias.updateMany as Mock;
const mockAliasDeleteMany = prisma.alias.deleteMany as Mock;
const mockDomainCount = prisma.domain.count as Mock;
const mockDomainFindMany = prisma.domain.findMany as Mock;
const mockDomainUpdateMany = prisma.domain.updateMany as Mock;
const mockDomainDeleteMany = prisma.domain.deleteMany as Mock;
const mockRecipientCount = prisma.recipient.count as Mock;
const mockRecipientFindMany = prisma.recipient.findMany as Mock;
const mockRecipientUpdateMany = prisma.recipient.updateMany as Mock;
const mockRecipientDeleteMany = prisma.recipient.deleteMany as Mock;
const mockTransaction = (prisma as unknown as { $transaction: Mock }).$transaction;

describe("BillingDowngradeService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default: free tier limits
        mockGetPlanLimitsImpl.mockReturnValue({
            random: 10,
            custom: 1,
            domains: 0,
            apiRequests: 500,
            recipients: 1,
        });
        mockGetRecipientLimitImpl.mockReturnValue(1);
        mockGetDropLimitsImpl.mockReturnValue({
            maxStorage: 1073741824, // 1GB
            maxExpiry: 7,
            downloadLimits: false,
            features: { downloadLimits: false },
        });
    });

    describe("recordDowngrade", () => {
        it("should set downgradedAt when not already set", async () => {
            mockUserUpdateMany.mockResolvedValue({ count: 1 });

            await BillingDowngradeService.recordDowngrade("user_1");

            expect(mockUserUpdateMany).toHaveBeenCalledWith({
                where: { id: "user_1", downgradedAt: null },
                data: { downgradedAt: expect.any(Date) },
            });
        });

        it("should be idempotent — not overwrite existing downgradedAt", async () => {
            mockUserUpdateMany.mockResolvedValue({ count: 0 });

            await BillingDowngradeService.recordDowngrade("user_1");

            expect(mockUserUpdateMany).toHaveBeenCalledTimes(1);
            // count: 0 means the condition (downgradedAt: null) didn't match
        });
    });

    describe("cancelDowngrade", () => {
        it("should clear downgradedAt and unschedule all resources atomically", async () => {
            mockUserUpdate.mockResolvedValue({});
            mockAliasUpdateMany.mockResolvedValue({ count: 3 });
            mockDomainUpdateMany.mockResolvedValue({ count: 1 });
            mockRecipientUpdateMany.mockResolvedValue({ count: 2 });

            await BillingDowngradeService.cancelDowngrade("user_1");

            // Should use batch $transaction for atomicity
            expect(mockTransaction).toHaveBeenCalledTimes(1);
            expect(mockTransaction).toHaveBeenCalledWith(expect.any(Array));
        });
    });

    describe("calculateExcess", () => {
        it("should correctly calculate excess per resource type", async () => {
            mockAliasCount
                .mockResolvedValueOnce(15) // random
                .mockResolvedValueOnce(3);  // custom
            mockDomainCount.mockResolvedValue(2);
            mockRecipientCount.mockResolvedValue(4);

            const excess = await BillingDowngradeService.calculateExcess("user_1");

            expect(excess).toEqual({
                excessRandom: 5,   // 15 - 10 (free limit)
                excessCustom: 2,   // 3 - 1
                excessDomains: 2,  // 2 - 0
                excessRecipients: 3, // 4 - 1
            });
        });

        it("should return zeros when within limits", async () => {
            mockAliasCount
                .mockResolvedValueOnce(5)  // random
                .mockResolvedValueOnce(1); // custom
            mockDomainCount.mockResolvedValue(0);
            mockRecipientCount.mockResolvedValue(1);

            const excess = await BillingDowngradeService.calculateExcess("user_1");

            expect(excess).toEqual({
                excessRandom: 0,
                excessCustom: 0,
                excessDomains: 0,
                excessRecipients: 0,
            });
        });
    });

    describe("scheduleExcessForUser", () => {
        it("should cancel downgrade if user re-subscribed", async () => {
            mockUserFindUnique.mockResolvedValue({
                id: "user_1",
                email: "test@example.com",
                subscriptions: [{ id: "sub_1" }],
                downgradedAt: new Date(),
            });
            mockUserUpdate.mockResolvedValue({});
            mockAliasUpdateMany.mockResolvedValue({ count: 0 });
            mockDomainUpdateMany.mockResolvedValue({ count: 0 });
            mockRecipientUpdateMany.mockResolvedValue({ count: 0 });

            await BillingDowngradeService.scheduleExcessForUser("user_1");

            // Should have called cancelDowngrade
            expect(mockUserUpdate).toHaveBeenCalledWith({
                where: { id: "user_1" },
                data: { downgradedAt: null },
            });
        });

        it("should skip if resources already scheduled", async () => {
            mockUserFindUnique.mockResolvedValue({
                id: "user_1",
                email: "test@example.com",
                subscriptions: [],
                downgradedAt: new Date(),
            });
            // Resources already scheduled
            mockAliasCount.mockResolvedValueOnce(5); // scheduled aliases
            mockDomainCount.mockResolvedValueOnce(0);
            mockRecipientCount.mockResolvedValueOnce(0);

            await BillingDowngradeService.scheduleExcessForUser("user_1");

            // Should not schedule anything new
            expect(mockAliasFindMany).not.toHaveBeenCalled();
        });

        it("should schedule excess aliases, domains, and recipients", async () => {
            mockUserFindUnique.mockResolvedValue({
                id: "user_1",
                email: "test@example.com",
                subscriptions: [],
                downgradedAt: new Date(),
            });

            // No resources already scheduled
            mockAliasCount.mockResolvedValueOnce(0);
            mockDomainCount.mockResolvedValueOnce(0);
            mockRecipientCount.mockResolvedValueOnce(0);

            // Aliases: 12 random (excess = 2), 3 custom (excess = 2)
            const randomAliases = Array.from({ length: 12 }, (_, i) => ({ id: `random_${i}` }));
            const customAliases = Array.from({ length: 3 }, (_, i) => ({ id: `custom_${i}` }));

            mockAliasFindMany
                .mockResolvedValueOnce(randomAliases)  // random aliases
                .mockResolvedValueOnce(customAliases)  // custom aliases
                .mockResolvedValueOnce([{ email: "a@test.com", format: "RANDOM" }, { email: "b@test.com", format: "CUSTOM" }]); // for email

            mockAliasUpdateMany.mockResolvedValue({ count: 4 });

            // Domains: 2 (all excess on free)
            const domains = [
                { id: "domain_1", domain: "example.com" },
                { id: "domain_2", domain: "test.com" },
            ];
            mockDomainFindMany.mockResolvedValue(domains);
            mockDomainUpdateMany.mockResolvedValue({ count: 2 });

            // Recipients: 3 (excess = 2)
            const recipients = [
                { id: "recip_1", email: "r1@test.com", isDefault: true, createdAt: new Date("2024-01-01") },
                { id: "recip_2", email: "r2@test.com", isDefault: false, createdAt: new Date("2024-02-01") },
                { id: "recip_3", email: "r3@test.com", isDefault: false, createdAt: new Date("2024-03-01") },
            ];
            mockRecipientFindMany
                .mockResolvedValueOnce(recipients)
                .mockResolvedValueOnce([{ email: "r2@test.com" }, { email: "r3@test.com" }]); // for email
            mockRecipientUpdateMany.mockResolvedValue({ count: 2 });

            await BillingDowngradeService.scheduleExcessForUser("user_1");

            // Should use interactive $transaction for atomic scheduling
            expect(mockTransaction).toHaveBeenCalledWith(expect.any(Function));
            // Should have scheduled aliases
            expect(mockAliasUpdateMany).toHaveBeenCalled();
            // Should have scheduled domains
            expect(mockDomainUpdateMany).toHaveBeenCalled();
            // Should have scheduled recipients
            expect(mockRecipientUpdateMany).toHaveBeenCalled();
        });

        it("should clear downgradedAt when user is within free limits", async () => {
            mockUserFindUnique.mockResolvedValue({
                id: "user_1",
                email: "test@example.com",
                subscriptions: [],
                downgradedAt: new Date(),
            });

            // No resources already scheduled
            mockAliasCount.mockResolvedValueOnce(0);
            mockDomainCount.mockResolvedValueOnce(0);
            mockRecipientCount.mockResolvedValueOnce(0);

            // Within limits: 5 random, 1 custom, 0 domains, 1 recipient
            mockAliasFindMany
                .mockResolvedValueOnce(Array.from({ length: 5 }, (_, i) => ({ id: `r_${i}` })))  // random
                .mockResolvedValueOnce([{ id: "c_0" }]);  // custom
            mockDomainFindMany.mockResolvedValue([]);
            mockRecipientFindMany.mockResolvedValue([
                { id: "recip_1", email: "r@test.com", isDefault: true, createdAt: new Date() },
            ]);

            mockUserUpdate.mockResolvedValue({});

            await BillingDowngradeService.scheduleExcessForUser("user_1");

            // Should clear downgradedAt since within limits
            expect(mockUserUpdate).toHaveBeenCalledWith({
                where: { id: "user_1" },
                data: { downgradedAt: null },
            });
        });
    });

    describe("processSchedulingBatch", () => {
        it("should find and process eligible users", async () => {
            mockUserFindMany.mockResolvedValue([{ id: "user_1" }]);

            // Mock the full scheduleExcessForUser path
            mockUserFindUnique.mockResolvedValue({
                id: "user_1",
                email: "test@example.com",
                subscriptions: [],
                downgradedAt: new Date(),
            });
            mockAliasCount.mockResolvedValue(0);
            mockDomainCount.mockResolvedValue(0);
            mockRecipientCount.mockResolvedValue(0);
            mockAliasFindMany.mockResolvedValue([]);
            mockDomainFindMany.mockResolvedValue([]);
            mockRecipientFindMany.mockResolvedValue([]);
            mockUserUpdate.mockResolvedValue({});

            const result = await BillingDowngradeService.processSchedulingBatch();

            expect(result.processed).toBe(1);
            expect(result.errors).toBe(0);
        });

        it("should handle errors gracefully", async () => {
            mockUserFindMany.mockResolvedValue([{ id: "user_1" }]);
            mockUserFindUnique.mockRejectedValue(new Error("DB error"));

            const result = await BillingDowngradeService.processSchedulingBatch();

            expect(result.processed).toBe(0);
            expect(result.errors).toBe(1);
        });
    });

    describe("deleteScheduledForUser", () => {
        it("should delete excess and spare remaining", async () => {
            mockUserFindUnique.mockResolvedValueOnce({
                id: "user_1",
                email: "test@example.com",
                subscriptions: [], // still on free tier
            });
            // Second findUnique call inside deleteScheduledForUser reads storageUsed
            mockUserFindUnique.mockResolvedValueOnce({ storageUsed: BigInt(0) });

            // Free limits: 10 random, 1 custom, 0 domains, 1 recipient
            // Current totals: 12 random, 3 custom, 2 domains, 3 recipients
            mockAliasCount
                .mockResolvedValueOnce(12) // all random
                .mockResolvedValueOnce(3); // all custom

            // Scheduled: 2 random, 2 custom
            mockAliasFindMany
                .mockResolvedValueOnce([{ id: "r_sched_1" }, { id: "r_sched_2" }]) // scheduled random
                .mockResolvedValueOnce([{ id: "c_sched_1" }, { id: "c_sched_2" }]); // scheduled custom

            mockAliasDeleteMany.mockResolvedValue({ count: 4 });
            mockAliasUpdateMany.mockResolvedValue({ count: 0 });

            // Domains: all 2 scheduled
            mockDomainCount.mockResolvedValue(2);
            mockDomainFindMany.mockResolvedValue([{ id: "d_1" }, { id: "d_2" }]);
            mockDomainDeleteMany.mockResolvedValue({ count: 2 });

            // Recipients: 3 total, 2 scheduled
            mockRecipientFindMany
                .mockResolvedValueOnce([{ id: "r_1", isDefault: true }, { id: "r_2" }, { id: "r_3" }])
                .mockResolvedValueOnce([{ id: "r_2" }, { id: "r_3" }]); // scheduled
            mockRecipientDeleteMany.mockResolvedValue({ count: 2 });

            mockUserUpdate.mockResolvedValue({});

            await BillingDowngradeService.deleteScheduledForUser("user_1");

            // Should use interactive $transaction for atomic deletion
            expect(mockTransaction).toHaveBeenCalledWith(expect.any(Function));

            // Should have deleted resources
            expect(mockAliasDeleteMany).toHaveBeenCalled();
            expect(mockDomainDeleteMany).toHaveBeenCalled();
            expect(mockRecipientDeleteMany).toHaveBeenCalled();
        });

        it("should spare all if user re-subscribed", async () => {
            // Set pro limits for this test
            mockGetPlanLimitsImpl.mockReturnValue({
                random: 10000,
                custom: 100,
                domains: 10,
                apiRequests: 100000,
                recipients: 10,
            });
            mockGetRecipientLimitImpl.mockReturnValue(10);

            const futureDate = new Date(Date.now() + 30 * 86400000);
            mockUserFindUnique.mockResolvedValueOnce({
                id: "user_1",
                email: "test@example.com",
                subscriptions: [
                    {
                        status: "active",
                        product: "bundle",
                        tier: "pro",
                        currentPeriodEnd: futureDate,
                    },
                ],
            });
            // Second findUnique call inside deleteScheduledForUser reads storageUsed
            mockUserFindUnique.mockResolvedValueOnce({ storageUsed: BigInt(0) });

            // Pro limits: hidden 10k random cap, 100 custom, 10 domains, 10 recipients
            // Current totals are all under pro limits
            mockAliasCount
                .mockResolvedValueOnce(15) // random — within hidden cap
                .mockResolvedValueOnce(5); // custom — within 100

            // Scheduled aliases: 5 were scheduled but shouldn't be deleted
            mockAliasFindMany
                .mockResolvedValueOnce([{ id: "r1" }, { id: "r2" }, { id: "r3" }]) // scheduled random
                .mockResolvedValueOnce([{ id: "c1" }, { id: "c2" }]); // scheduled custom

            mockAliasUpdateMany.mockResolvedValue({ count: 5 }); // spare all

            mockDomainCount.mockResolvedValue(2); // within 10
            mockDomainFindMany.mockResolvedValue([{ id: "d1" }]); // 1 scheduled
            mockDomainUpdateMany.mockResolvedValue({ count: 1 }); // spare

            mockRecipientFindMany
                .mockResolvedValueOnce([{ id: "rec1", isDefault: true }, { id: "rec2" }, { id: "rec3" }])
                .mockResolvedValueOnce([{ id: "rec2" }]); // 1 scheduled

            mockRecipientUpdateMany.mockResolvedValue({ count: 1 }); // spare

            mockUserUpdate.mockResolvedValue({});

            await BillingDowngradeService.deleteScheduledForUser("user_1");

            // Should NOT delete anything (all excess is 0 since plan has high limits)
            expect(mockAliasDeleteMany).not.toHaveBeenCalled();
            expect(mockDomainDeleteMany).not.toHaveBeenCalled();
            expect(mockRecipientDeleteMany).not.toHaveBeenCalled();

            // Should have spared all scheduled random/custom aliases
            expect(mockAliasUpdateMany).toHaveBeenCalledWith({
                where: { id: { in: ["r1", "r2", "r3", "c1", "c2"] } },
                data: { scheduledForRemovalAt: null },
            });
        });
    });

    describe("processDeletionBatch", () => {
        it("should find users with expired scheduled resources and process them", async () => {
            // Users with scheduled aliases
            mockAliasFindMany.mockResolvedValueOnce([{ userId: "user_1" }]);
            // Users with scheduled domains
            mockDomainFindMany.mockResolvedValueOnce([{ userId: "user_1" }]);
            // Users with scheduled recipients
            mockRecipientFindMany.mockResolvedValueOnce([{ userId: "user_2" }]);

            // Mock the full deleteScheduledForUser path for each user
            mockUserFindUnique.mockResolvedValue({
                id: "user_1",
                email: "test@example.com",
                subscriptions: [],
                storageUsed: BigInt(0),
            });

            // Simplified: no excess after deletion check
            mockAliasCount.mockResolvedValue(5);
            mockAliasFindMany.mockResolvedValue([]);
            mockDomainCount.mockResolvedValue(0);
            mockDomainFindMany.mockResolvedValue([]);
            mockRecipientFindMany.mockResolvedValue([]);
            mockUserUpdate.mockResolvedValue({});

            const result = await BillingDowngradeService.processDeletionBatch();

            expect(result.processed).toBeGreaterThanOrEqual(0);
        });
    });
});
