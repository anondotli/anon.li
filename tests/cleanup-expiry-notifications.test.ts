/**
 * Expiring-drop notifications in the cleanup cron: only standalone drops are
 * announced, and a drop is only marked notified when the email actually went out.
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    dropFindMany: vi.fn(),
    dropUpdateMany: vi.fn(),
    sendDropExpiringEmail: vi.fn(),
}));

const emptyTask = { found: 0, deleted: 0, errors: [] };

vi.mock("@/lib/prisma", () => ({
    prisma: {
        drop: { findMany: mocks.dropFindMany, updateMany: mocks.dropUpdateMany },
        session: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    },
}));
vi.mock("@/lib/resend", () => ({ sendDropExpiringEmail: mocks.sendDropExpiringEmail }));
vi.mock("@/lib/drop-utils", () => ({ cleanupExpiredSessions: vi.fn().mockResolvedValue(0) }));
vi.mock("@/lib/services/drop-cleanup", () => ({
    DropCleanupService: {
        cleanupExpiredDrops: vi.fn().mockResolvedValue(emptyTask),
        cleanupIncompleteUploads: vi.fn().mockResolvedValue(emptyTask),
        cleanupDownloadLimitExceededDrops: vi.fn().mockResolvedValue(emptyTask),
        cleanupSoftDeletedDrops: vi.fn().mockResolvedValue(emptyTask),
        cleanupOrphanedFiles: vi.fn().mockResolvedValue(emptyTask),
        cleanupIncompleteFiles: vi.fn().mockResolvedValue(emptyTask),
    },
}));
vi.mock("@/lib/services/form-cleanup", () => ({
    FormCleanupService: {
        cleanupExpiredSubmissions: vi.fn().mockResolvedValue(emptyTask),
        cleanupDeletedForms: vi.fn().mockResolvedValue(emptyTask),
        cleanupOldUsageEvents: vi.fn().mockResolvedValue(emptyTask),
    },
}));
vi.mock("@/lib/cron-lock", () => ({
    withCronLock: vi.fn(async (_name: string, _ttl: number, fn: () => unknown) => fn()),
}));

import { GET } from "@/app/api/cron/cleanup/route";

const run = () => GET(new Request("http://localhost/api/cron/cleanup", {
    headers: { Authorization: "Bearer test-cron-secret" },
}) as never);

describe("cleanup cron expiring-drop notifications", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.CRON_SECRET = "test-cron-secret";
        mocks.dropUpdateMany.mockResolvedValue({ count: 1 });
        mocks.dropFindMany.mockResolvedValue([
            { id: "drop_1", expiresAt: new Date(Date.now() + 30 * 3600_000), user: { email: "a@example.com" } },
        ]);
    });

    it("selects every unnotified drop expiring within 48h, excluding Form attachments and brand-new drops", async () => {
        mocks.sendDropExpiringEmail.mockResolvedValue({ success: true });

        await run();

        const where = mocks.dropFindMany.mock.calls[0]![0].where;
        expect(where).toEqual(expect.objectContaining({
            expiresAt: { gt: expect.any(Date), lte: expect.any(Date) },
            createdAt: { lte: expect.any(Date) },
            expiryNotifiedAt: null,
            formSubmission: null,
            formStagingId: null,
            uploadTokens: { none: { formId: { not: null } } },
        }));
        const windowMs = where.expiresAt.lte.getTime() - where.expiresAt.gt.getTime();
        expect(windowMs).toBe(48 * 3600_000);
    });

    it("claims the drop before sending and keeps the claim after a successful send", async () => {
        mocks.sendDropExpiringEmail.mockResolvedValue({ success: true });

        const res = await run();
        const body = await res.json();

        expect(mocks.dropUpdateMany).toHaveBeenCalledTimes(1);
        expect(mocks.dropUpdateMany).toHaveBeenCalledWith({
            where: { id: "drop_1", expiryNotifiedAt: null },
            data: { expiryNotifiedAt: expect.any(Date) },
        });
        expect(mocks.dropUpdateMany.mock.invocationCallOrder[0]!)
            .toBeLessThan(mocks.sendDropExpiringEmail.mock.invocationCallOrder[0]!);
        expect(body.expiringNotificationsSent).toBe(1);
    });

    it("never emails a drop another run already claimed", async () => {
        mocks.dropUpdateMany.mockResolvedValue({ count: 0 });

        await run();

        expect(mocks.sendDropExpiringEmail).not.toHaveBeenCalled();
    });

    it("releases the claim when the send fails so the next run retries", async () => {
        mocks.sendDropExpiringEmail.mockResolvedValue({ success: false, error: "rate limited" });

        const res = await run();
        const body = await res.json();

        expect(mocks.dropUpdateMany).toHaveBeenLastCalledWith({
            where: { id: "drop_1", expiryNotifiedAt: expect.any(Date) },
            data: { expiryNotifiedAt: null },
        });
        expect(res.status).toBe(500);
        expect(body.errors).toContain("expiryNotification:drop_1");
        expect(body.expiringNotificationsSent).toBe(0);
    });

    it("releases the claim when the send throws", async () => {
        mocks.sendDropExpiringEmail.mockRejectedValue(new Error("network"));

        await run();

        expect(mocks.dropUpdateMany).toHaveBeenLastCalledWith({
            where: { id: "drop_1", expiryNotifiedAt: expect.any(Date) },
            data: { expiryNotifiedAt: null },
        });
    });
});
