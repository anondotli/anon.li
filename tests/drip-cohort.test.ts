/**
 * Growth-email cohorts (drip + power-user upsell): complimentary-Plus and
 * pending-deletion accounts are excluded, and the drip cron pages past
 * already-emailed users so busy signup days don't starve later signups.
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { userFindMany, queryRaw, redisGet, redisSet, sendDripDay1Email } = vi.hoisted(() => ({
    sendDripDay1Email: vi.fn(),
    userFindMany: vi.fn(),
    queryRaw: vi.fn(),
    redisGet: vi.fn(),
    redisSet: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
    prisma: { user: { findMany: userFindMany }, $queryRaw: queryRaw },
}));

vi.mock("@/lib/resend", () => ({
    sendDripDay1Email,
    sendDripDay3Email: vi.fn(),
    sendDripDay7Email: vi.fn(),
    sendDripDay14Email: vi.fn(),
}));

vi.mock("@upstash/redis", () => ({
    Redis: class {
        get = redisGet;
        set = redisSet;
    },
}));

import { getDripCohort, getHeavyFreeUsers } from "@/lib/data/user";
import { handleDripCron } from "@/lib/services/cron-drip";

const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
    vi.clearAllMocks();
    userFindMany.mockResolvedValue([]);
    queryRaw.mockResolvedValue([]);
    redisGet.mockResolvedValue(null);
    redisSet.mockResolvedValue("OK");
    sendDripDay1Email.mockResolvedValue({ success: true });
});

describe("getDripCohort", () => {
    it("excludes active referral Plus and pending-deletion accounts, with a stable order", async () => {
        await getDripCohort({ minAgeMs: DAY_MS, maxAgeMs: 3 * DAY_MS, excludeEmails: [], limit: 10 });

        const args = userFindMany.mock.calls[0]![0];
        expect(args.where.deletionRequest).toEqual({ is: null });
        expect(args.where.OR).toEqual([
            { referralPlusUntil: null },
            { referralPlusUntil: { lte: expect.any(Date) } },
        ]);
        expect(args.orderBy).toEqual([{ createdAt: "asc" }, { id: "asc" }]);
        expect(args.cursor).toBeUndefined();
    });

    it("continues after the cursor when paging", async () => {
        await getDripCohort({ minAgeMs: DAY_MS, maxAgeMs: 3 * DAY_MS, excludeEmails: [], limit: 10, cursor: "user-9" });

        const args = userFindMany.mock.calls[0]![0];
        expect(args).toMatchObject({ cursor: { id: "user-9" }, skip: 1, take: 10 });
    });
});

describe("getHeavyFreeUsers", () => {
    it("excludes referral Plus and pending-deletion accounts and pages deterministically", async () => {
        await getHeavyFreeUsers({
            minAliases: 5,
            minEmailsForwarded: 15,
            excludeEmails: [],
            createdBefore: new Date(),
            limit: 200,
            offset: 400,
        });

        const [strings, ...values] = queryRaw.mock.calls[0]!;
        const sql = (strings as TemplateStringsArray).join("?");
        expect(sql).toContain('FROM deletion_requests d WHERE d."userId" = u.id');
        expect(sql).toContain('u."referral_plus_until" IS NULL OR u."referral_plus_until" <= NOW()');
        expect(sql).toContain("u.id ASC");
        expect(sql).toContain("OFFSET");
        expect(values.at(-1)).toBe(400);
    });
});

describe("handleDripCron paging", () => {
    it("walks past a full page of already-emailed users to reach later signups", async () => {
        const emailed = Array.from({ length: 200 }, (_, i) => ({ id: `old-${i}`, email: `old-${i}@example.com` }));
        const fresh = { id: "fresh", email: "fresh@example.com" };
        // Day-1 stage gets two pages; later stages get nothing.
        userFindMany
            .mockResolvedValueOnce(emailed)
            .mockResolvedValueOnce([fresh])
            .mockResolvedValue([]);
        redisGet.mockImplementation(async (key: string) => (key === "drip:day1:fresh" ? null : "1"));

        const results = await handleDripCron();

        expect(userFindMany.mock.calls[1]![0]).toMatchObject({ cursor: { id: "old-199" }, skip: 1 });
        expect(results.day1).toMatchObject({ sent: 1, skipped: 200 });
        expect(sendDripDay1Email).toHaveBeenCalledWith("fresh@example.com", "fresh");
    });
});
