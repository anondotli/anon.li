/**
 * Tests for BillingDowngradeService
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const mockDeleteObject = vi.hoisted(() => vi.fn());
const mockDeleteDropFilesAndReleaseQuota = vi.hoisted(() => vi.fn());

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
        drop: {
            findMany: vi.fn(),
            updateMany: vi.fn(),
        },
        aliasRecipient: {
            findMany: vi.fn().mockResolvedValue([]),
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        subscription: {
            count: vi.fn().mockResolvedValue(0),
        },
        orphanedFile: {
            create: vi.fn(),
        },
        $executeRaw: vi.fn().mockResolvedValue(0),
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

vi.mock("@/lib/storage", () => ({
    abortMultipartUpload: vi.fn(),
    deleteObject: mockDeleteObject,
}));

vi.mock("@/lib/services/drop-storage", () => ({
    deleteDropFilesAndReleaseQuota: mockDeleteDropFilesAndReleaseQuota,
}));

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
const mockDropFindMany = prisma.drop.findMany as Mock;
const mockOrphanedFileCreate = prisma.orphanedFile.create as Mock;
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
                downgradedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
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

        it("keeps downgradedAt through the Form retention grace when no other resources are excessive", async () => {
            mockUserFindUnique.mockResolvedValue({
                id: "user_1",
                email: "test@example.com",
                subscriptions: [],
                downgradedAt: new Date(),
            });
            mockAliasCount.mockResolvedValueOnce(0);
            mockDomainCount.mockResolvedValueOnce(0);
            mockRecipientCount.mockResolvedValueOnce(0);
            mockAliasFindMany
                .mockResolvedValueOnce(Array.from({ length: 5 }, (_, i) => ({ id: `r_${i}` })))
                .mockResolvedValueOnce([{ id: "c_0" }]);
            mockDomainFindMany.mockResolvedValue([]);
            mockRecipientFindMany.mockResolvedValue([
                { id: "recip_1", email: "r@test.com", isDefault: true, createdAt: new Date() },
            ]);

            await BillingDowngradeService.scheduleExcessForUser("user_1");

            expect(mockUserUpdate).not.toHaveBeenCalled();
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
        it("claims downgraded drop quota once and tracks failed R2 deletion as an orphan", async () => {
            mockGetDropLimitsImpl.mockReturnValue({
                maxStorage: 100,
                maxExpiry: 7,
                downloadLimits: false,
                features: { downloadLimits: false },
            });
            mockUserFindUnique
                .mockResolvedValueOnce({ id: "user_1", email: "test@example.com", subscriptions: [] })
                .mockResolvedValueOnce({ storageUsed: BigInt(200) })
                .mockResolvedValueOnce({ storageUsed: BigInt(80) });
            mockDropFindMany.mockResolvedValue([
                {
                    id: "drop_1",
                    files: [{ id: "file_1", storageKey: "key_1", size: BigInt(120) }],
                },
            ]);
            mockDeleteObject.mockRejectedValueOnce(new Error("R2 unavailable"));
            mockOrphanedFileCreate.mockResolvedValue({ id: "orphan_1" });
            mockDeleteDropFilesAndReleaseQuota.mockResolvedValue({
                files: [{ storageKey: "key_1", s3UploadId: null, size: BigInt(120) }],
                deletedFiles: 1,
                releasedBytes: BigInt(120),
            });

            mockAliasCount.mockResolvedValue(0);
            mockAliasFindMany.mockResolvedValue([]);
            mockDomainCount.mockResolvedValue(0);
            mockDomainFindMany.mockResolvedValue([]);
            mockRecipientFindMany.mockResolvedValue([]);
            mockUserUpdate.mockResolvedValue({});

            await BillingDowngradeService.deleteScheduledForUser("user_1");

            expect(mockDeleteDropFilesAndReleaseQuota).toHaveBeenCalledWith("drop_1");
            expect(mockOrphanedFileCreate).toHaveBeenCalledWith({ data: { storageKey: "key_1" } });
            expect(mockUserUpdate).toHaveBeenCalledTimes(1);
            expect(mockUserUpdate).not.toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({ storageUsed: expect.anything() }),
            }));
        });

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

    describe("billing-loss drop grace", () => {
        const mockDropUpdateMany = prisma.drop.updateMany as Mock;
        const mockExecuteRaw = (prisma as unknown as { $executeRaw: Mock }).$executeRaw;

        it("stamps only unlimited standalone drops and records the grace marker", async () => {
            mockDropUpdateMany.mockResolvedValue({ count: 2 });
            mockUserUpdateMany.mockResolvedValue({ count: 1 });

            const expiry = await BillingDowngradeService.handlePersonalSubscriptionLoss("user_1", null, { notify: false });

            expect(mockDropUpdateMany).toHaveBeenCalledWith({
                where: {
                    userId: "user_1",
                    organizationId: null,
                    expiresAt: null,
                    deletedAt: null,
                    formSubmission: null,
                    formStagingId: null,
                    uploadTokens: { none: { formId: { not: null } } },
                },
                data: { expiresAt: expiry, billingGraceExpiresAt: expiry },
            });
            expect(mockUserUpdateMany).toHaveBeenCalledWith({
                where: { id: "user_1", downgradedAt: null },
                data: { downgradedAt: expect.any(Date) },
            });
        });

        it("notifies only when asked to", async () => {
            const resend = await import("@/lib/resend");
            mockDropUpdateMany.mockResolvedValue({ count: 0 });
            mockUserUpdateMany.mockResolvedValue({ count: 1 });
            mockAliasCount.mockResolvedValue(0);
            mockDomainCount.mockResolvedValue(0);
            mockRecipientCount.mockResolvedValue(0);

            await BillingDowngradeService.handlePersonalSubscriptionLoss("user_1", "u@example.com", { notify: false });
            expect(resend.sendSubscriptionCanceledEmail).not.toHaveBeenCalled();

            await BillingDowngradeService.handlePersonalSubscriptionLoss("user_1", "u@example.com", { notify: true });
            expect(resend.sendSubscriptionCanceledEmail).toHaveBeenCalledWith("u@example.com", expect.any(Date));
        });

        function executedSql() {
            const [strings, ...values] = mockExecuteRaw.mock.calls[0]!;
            return Prisma.sql(strings as string[], ...(values as unknown[]));
        }

        function setupCancel() {
            mockUserFindUnique.mockResolvedValue({ referralPlusUntil: null, subscriptions: [] });
            mockUserUpdate.mockResolvedValue({});
            mockAliasUpdateMany.mockResolvedValue({ count: 0 });
            mockDomainUpdateMany.mockResolvedValue({ count: 0 });
            mockRecipientUpdateMany.mockResolvedValue({ count: 0 });
            mockExecuteRaw.mockResolvedValue(3);
        }

        it("restores grace-stamped drops to unlimited when the plan allows no expiry", async () => {
            setupCancel();
            mockGetDropLimitsImpl.mockReturnValue({ maxStorage: 1, maxExpiry: -1, downloadLimits: true, features: {} });

            await BillingDowngradeService.cancelDowngrade("user_1");

            expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
            const sql = executedSql();
            // Only un-stamp an expiry that is still the stamped grace value,
            // scoped to the user's personal, non-Form drops.
            expect(sql.sql).toContain('WHEN "expiresAt" = "billing_grace_expires_at" THEN NULL');
            expect(sql.sql).toContain('"billing_grace_expires_at" = NULL');
            expect(sql.sql).toContain('"organizationId" IS NULL');
            expect(sql.sql).toContain('"form_staging_id" IS NULL');
            expect(sql.sql).toContain('"form_submissions"');
            expect(sql.values).toEqual(["user_1"]);
        });

        it("restores only up to the current plan's longest expiry when it has no unlimited option", async () => {
            setupCancel();
            mockGetDropLimitsImpl.mockReturnValue({ maxStorage: 1, maxExpiry: 30, downloadLimits: true, features: {} });

            await BillingDowngradeService.cancelDowngrade("user_1");

            const sql = executedSql();
            expect(sql.sql).toMatch(/SET "expiresAt" = CASE\s+WHEN "expiresAt" = "billing_grace_expires_at" THEN GREATEST\("expiresAt",/);
            const restoredTo = sql.values.find((v): v is Date => v instanceof Date)!;
            const days = (restoredTo.getTime() - Date.now()) / 86400000;
            expect(days).toBeGreaterThan(29.9);
            expect(days).toBeLessThanOrEqual(30);
            // Uses the user's current entitlement (subscriptions + referral Plus).
            expect(mockGetDropLimitsImpl).toHaveBeenCalledWith({ referralPlusUntil: null, subscriptions: [] });
        });

        it("re-arms the expiry warning for restored drops", async () => {
            setupCancel();

            await BillingDowngradeService.cancelDowngrade("user_1");

            expect(executedSql().sql).toMatch(/"expiryNotifiedAt" = CASE\s+WHEN "expiresAt" = "billing_grace_expires_at" THEN NULL/);
        });

        it("checks for an entitling personal subscription within the access grace", async () => {
            const mockSubscriptionCount = (prisma as unknown as { subscription: { count: Mock } }).subscription.count;
            mockSubscriptionCount.mockResolvedValueOnce(1);

            await expect(BillingDowngradeService.hasActivePersonalSubscription("user_1")).resolves.toBe(true);
            expect(mockSubscriptionCount).toHaveBeenCalledWith({
                where: expect.objectContaining({
                    userId: "user_1",
                    organizationId: null,
                    status: { in: ["active", "trialing"] },
                }),
            });
        });
    });

    describe("referral Plus during downgrade", () => {
        it("resolves excess against the user's current entitlement (referral Plus included)", async () => {
            const referralUser = { referralPlusUntil: new Date(Date.now() + 86400000), subscriptions: [] };
            mockUserFindUnique.mockResolvedValue(referralUser);
            mockGetPlanLimitsImpl.mockReturnValue({ random: 100, custom: 10, domains: 1, apiRequests: 0, recipients: 5 });
            mockAliasCount.mockResolvedValueOnce(15).mockResolvedValueOnce(3);
            mockDomainCount.mockResolvedValue(1);
            mockRecipientCount.mockResolvedValue(4);

            const excess = await BillingDowngradeService.calculateExcess("user_1");

            expect(mockGetPlanLimitsImpl).toHaveBeenCalledWith(referralUser);
            expect(excess).toEqual({ excessRandom: 0, excessCustom: 0, excessDomains: 0, excessRecipients: 0 });
        });

        it("does not schedule resources while referral Plus is active and keeps the downgrade marker", async () => {
            mockUserFindUnique.mockResolvedValue({
                id: "user_1",
                email: "test@example.com",
                downgradedAt: new Date(Date.now() - 30 * 86400000),
                referralPlusUntil: new Date(Date.now() + 86400000),
                subscriptions: [],
            });
            mockAliasCount.mockResolvedValue(0);
            mockDomainCount.mockResolvedValue(0);
            mockRecipientCount.mockResolvedValue(0);

            await BillingDowngradeService.scheduleExcessForUser("user_1");

            expect(mockAliasFindMany).not.toHaveBeenCalled();
            expect(mockTransaction).not.toHaveBeenCalled();
            expect(mockUserUpdate).not.toHaveBeenCalled();
        });

        it("excludes active referral Plus holders from the scheduling batch", async () => {
            mockUserFindMany.mockResolvedValue([]);

            await BillingDowngradeService.processSchedulingBatch();

            expect(mockUserFindMany).toHaveBeenCalledWith(expect.objectContaining({
                where: expect.objectContaining({
                    OR: [
                        { referralPlusUntil: null },
                        { referralPlusUntil: { lte: expect.any(Date) } },
                    ],
                }),
            }));
        });
    });

    describe("deleteScheduledForUser alias integrity", () => {
        const mockAliasRecipientFindMany = (prisma as unknown as { aliasRecipient: { findMany: Mock } }).aliasRecipient.findMany;
        const mockAliasRecipientCreateMany = (prisma as unknown as { aliasRecipient: { createMany: Mock } }).aliasRecipient.createMany;
        const mockAliasRecipientUpdateMany = (prisma as unknown as { aliasRecipient: { updateMany: Mock } }).aliasRecipient.updateMany;

        function setupFreeUser() {
            mockUserFindUnique
                .mockResolvedValueOnce({ id: "user_1", email: "test@example.com", subscriptions: [], referralPlusUntil: null })
                .mockResolvedValueOnce({ storageUsed: BigInt(0) });
            mockAliasCount.mockResolvedValue(0);
            mockAliasFindMany.mockResolvedValue([]);
        }

        it("deletes a removed domain's personal aliases in the same transaction", async () => {
            setupFreeUser();
            mockDomainCount.mockResolvedValue(1);
            mockDomainFindMany.mockResolvedValue([{ id: "d_1", domain: "example.com" }]);
            mockRecipientFindMany.mockResolvedValue([]);

            await BillingDowngradeService.deleteScheduledForUser("user_1");

            expect(mockAliasDeleteMany).toHaveBeenCalledWith({
                where: { userId: "user_1", organizationId: null, domain: { in: ["example.com"] } },
            });
            expect(mockDomainDeleteMany).toHaveBeenCalledWith({ where: { id: { in: ["d_1"] } } });
            const aliasDeleteOrder = mockAliasDeleteMany.mock.invocationCallOrder[0]!;
            const domainDeleteOrder = mockDomainDeleteMany.mock.invocationCallOrder[0]!;
            expect(aliasDeleteOrder).toBeLessThan(domainDeleteOrder);
        });

        it("repoints aliases routed to a deleted recipient before deleting it", async () => {
            setupFreeUser();
            mockDomainCount.mockResolvedValue(0);
            mockDomainFindMany.mockResolvedValue([]);
            mockRecipientFindMany
                .mockResolvedValueOnce([
                    { id: "rec_default", isDefault: true },
                    { id: "rec_gone", isDefault: false },
                    { id: "rec_kept", isDefault: false },
                ])
                .mockResolvedValueOnce([{ id: "rec_gone" }]); // scheduled
            mockGetRecipientLimitImpl.mockReturnValue(2);
            mockAliasRecipientFindMany
                // Join rows to the deleted recipient
                .mockResolvedValueOnce([
                    { aliasId: "alias_only_gone", isPrimary: true },
                    { aliasId: "alias_shared", isPrimary: true },
                ])
                // Surviving join rows of the affected aliases
                .mockResolvedValueOnce([
                    { id: "ar_shared_kept", aliasId: "alias_shared", isPrimary: false },
                ]);

            await BillingDowngradeService.deleteScheduledForUser("user_1");

            // Alias left without recipients gets the default as its primary.
            expect(mockAliasRecipientCreateMany).toHaveBeenCalledWith({
                data: [{ aliasId: "alias_only_gone", recipientId: "rec_default", ordinal: 0, isPrimary: true }],
                skipDuplicates: true,
            });
            // Alias that keeps another recipient promotes it to primary.
            expect(mockAliasRecipientUpdateMany).toHaveBeenCalledWith({
                where: { id: { in: ["ar_shared_kept"] } },
                data: { isPrimary: true },
            });
            // Legacy single-recipient pointer is repointed.
            expect(mockAliasUpdateMany).toHaveBeenCalledWith({
                where: { recipientId: { in: ["rec_gone"] } },
                data: { recipientId: "rec_default" },
            });
            expect(mockRecipientDeleteMany).toHaveBeenCalledWith({ where: { id: { in: ["rec_gone"] } } });
            const reassignOrder = mockAliasRecipientCreateMany.mock.invocationCallOrder[0]!;
            const deleteOrder = mockRecipientDeleteMany.mock.invocationCallOrder[0]!;
            expect(reassignOrder).toBeLessThan(deleteOrder);
        });
    });

    describe("dunning does not start the resource-deletion clock", () => {
        const mockSubscriptionCount = (prisma as unknown as { subscription: { count: Mock } }).subscription.count;

        it("does not schedule resources while a personal Stripe subscription is in dunning", async () => {
            mockUserFindUnique.mockResolvedValue({
                id: "user_1",
                email: "test@example.com",
                downgradedAt: new Date(Date.now() - 10 * 86400000),
                referralPlusUntil: null,
                subscriptions: [],
            });
            mockSubscriptionCount.mockResolvedValueOnce(1);

            await BillingDowngradeService.scheduleExcessForUser("user_1");

            expect(mockSubscriptionCount).toHaveBeenCalledWith({
                where: {
                    userId: "user_1",
                    organizationId: null,
                    provider: "stripe",
                    status: "past_due",
                    lossNotifiedAt: null,
                },
            });
            expect(mockAliasFindMany).not.toHaveBeenCalled();
            expect(mockTransaction).not.toHaveBeenCalled();
            expect(mockUserUpdate).not.toHaveBeenCalled();
        });

        it("stops deferring once the dunning bound has passed", async () => {
            await expect(
                BillingDowngradeService.isInDunning("user_1", new Date(Date.now() - 90 * 86400000)),
            ).resolves.toBe(false);
            expect(mockSubscriptionCount).not.toHaveBeenCalled();
        });

        it("excludes users in dunning from the scheduling batch", async () => {
            mockUserFindMany.mockResolvedValue([]);

            await BillingDowngradeService.processSchedulingBatch();

            const where = mockUserFindMany.mock.calls[0]![0].where;
            expect(where.AND).toContainEqual({
                OR: [
                    { downgradedAt: { lte: expect.any(Date) } },
                    {
                        subscriptions: {
                            none: { organizationId: null, provider: "stripe", status: "past_due", lossNotifiedAt: null },
                        },
                    },
                ],
            });
        });

        it("restarts the clock on the first terminal loss signal", async () => {
            const mockDropUpdateMany = prisma.drop.updateMany as Mock;
            mockDropUpdateMany.mockResolvedValue({ count: 0 });
            mockUserUpdateMany.mockResolvedValue({ count: 1 });
            mockAliasCount.mockResolvedValue(0);
            mockDomainCount.mockResolvedValue(0);
            mockRecipientCount.mockResolvedValue(0);

            await BillingDowngradeService.handlePersonalSubscriptionLoss("user_1", "u@example.com", { notify: true });

            // Unconditional (no downgradedAt: null guard): a marker set during
            // dunning must not shorten the announced 7+7-day window.
            expect(mockUserUpdateMany).toHaveBeenCalledWith({
                where: { id: "user_1" },
                data: { downgradedAt: expect.any(Date) },
            });
        });
    });
});
