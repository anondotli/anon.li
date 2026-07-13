/**
 * Tests for Cron Route GET/POST and auth behavior
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { cleanupExpiredDropsMock } = vi.hoisted(() => ({
    cleanupExpiredDropsMock: vi.fn().mockResolvedValue({ found: 0, deleted: 0, errors: [] }),
}));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        domain: {
            findMany: vi.fn().mockResolvedValue([]),
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        drop: {
            findMany: vi.fn().mockResolvedValue([]),
        },
        session: {
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
    },
}));

vi.mock("@/lib/resend", () => ({
    sendDomainDeletedEmail: vi.fn().mockResolvedValue({ success: true }),
    sendDomainUnverifiedEmail: vi.fn().mockResolvedValue({ success: true }),
    sendDropExpiringEmail: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/drop-utils", () => ({
    cleanupExpiredSessions: vi.fn().mockResolvedValue(0),
}));

vi.mock("@/lib/services/drop-cleanup", () => ({
    DropCleanupService: {
        cleanupExpiredDrops: cleanupExpiredDropsMock,
        cleanupIncompleteUploads: vi.fn().mockResolvedValue({ found: 0, deleted: 0, errors: [] }),
        cleanupDownloadLimitExceededDrops: vi.fn().mockResolvedValue({ found: 0, deleted: 0, errors: [] }),
        cleanupSoftDeletedDrops: vi.fn().mockResolvedValue({ found: 0, deleted: 0, errors: [] }),
        cleanupOrphanedFiles: vi.fn().mockResolvedValue({ found: 0, deleted: 0, errors: [] }),
        cleanupIncompleteFiles: vi.fn().mockResolvedValue({ found: 0, deleted: 0, errors: [] }),
    },
}));

vi.mock("@/lib/services/form-cleanup", () => ({
    FormCleanupService: {
        cleanupExpiredSubmissions: vi.fn().mockResolvedValue({ found: 0, deleted: 0, errors: [] }),
        cleanupDeletedForms: vi.fn().mockResolvedValue({ found: 0, deleted: 0, errors: [] }),
    },
}));

// Run the wrapped job inline instead of acquiring the real Upstash Redis lock,
// which would make a network call (the cron handlers' "200" path).
vi.mock("@/lib/cron-lock", () => ({
    withCronLock: vi.fn(async (_name: string, _ttl: number, fn: () => unknown) => fn()),
}));

const originalEnv = process.env;

describe("Cron Route Auth", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        cleanupExpiredDropsMock.mockResolvedValue({ found: 0, deleted: 0, errors: [] });
        process.env = {
            ...originalEnv,
            CRON_SECRET: "test-cron-secret",
        };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe("cleanup", () => {
        it("GET returns 401 without auth", async () => {
            const { GET } = await import("@/app/api/cron/cleanup/route");
            const req = new Request("http://localhost/api/cron/cleanup", { method: "GET" });
            const res = await GET(req as never);
            expect(res.status).toBe(401);
        });

        it("GET returns 200 with valid token", async () => {
            const { GET } = await import("@/app/api/cron/cleanup/route");
            const req = new Request("http://localhost/api/cron/cleanup", {
                method: "GET",
                headers: { Authorization: "Bearer test-cron-secret" },
            });
            const res = await GET(req as never);
            expect(res.status).toBe(200);
        });

        it("POST returns 200 with valid token", async () => {
            const { POST } = await import("@/app/api/cron/cleanup/route");
            const req = new Request("http://localhost/api/cron/cleanup", {
                method: "POST",
                headers: { Authorization: "Bearer test-cron-secret" },
            });
            const res = await POST(req as never);
            expect(res.status).toBe(200);
        });

        it("returns a failed run when a cleanup task reports partial errors", async () => {
            cleanupExpiredDropsMock.mockResolvedValue({
                found: 1,
                deleted: 0,
                errors: ["drop-1: storage deletion failed"],
            });

            const { GET } = await import("@/app/api/cron/cleanup/route");
            const req = new Request("http://localhost/api/cron/cleanup", {
                method: "GET",
                headers: { Authorization: "Bearer test-cron-secret" },
            });
            const res = await GET(req as never);
            const body = await res.json();

            expect(res.status).toBe(500);
            expect(body.success).toBe(false);
            expect(body.errors).toContain("drop-1: storage deletion failed");
        });
    });

    describe("domains", () => {
        it("GET returns 401 without auth", async () => {
            const { GET } = await import("@/app/api/cron/domains/route");
            const req = new Request("http://localhost/api/cron/domains", { method: "GET" });
            const res = await GET(req as never);
            expect(res.status).toBe(401);
        });

        it("GET returns 200 with valid token", async () => {
            const { GET } = await import("@/app/api/cron/domains/route");
            const req = new Request("http://localhost/api/cron/domains", {
                method: "GET",
                headers: { Authorization: "Bearer test-cron-secret" },
            });
            const res = await GET(req as never);
            expect(res.status).toBe(200);
        });

        it("POST returns 200 with valid token", async () => {
            const { POST } = await import("@/app/api/cron/domains/route");
            const req = new Request("http://localhost/api/cron/domains", {
                method: "POST",
                headers: { Authorization: "Bearer test-cron-secret" },
            });
            const res = await POST(req as never);
            expect(res.status).toBe(200);
        });
    });
});
