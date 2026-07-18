/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { domainCount, domainFindMany } = vi.hoisted(() => ({
    domainCount: vi.fn(),
    domainFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        domain: {
            count: domainCount,
            findMany: domainFindMany,
            update: vi.fn(),
        },
    },
}));
vi.mock("@/lib/resend", () => ({
    sendDomainDeletedEmail: vi.fn(),
    sendDomainUnverifiedEmail: vi.fn(),
}));
vi.mock("@/lib/data/organization", () => ({ getOrgAdminEmails: vi.fn() }));

import { reverifyActiveDomains } from "@/lib/services/cron-domains";

describe("domain cron batching", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        domainCount.mockResolvedValue(120);
        domainFindMany.mockResolvedValue([]);
    });

    it("rotates deterministic 50-domain pages instead of starving later rows", async () => {
        const epochDay = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
        const expectedPage = epochDay % 3;

        await reverifyActiveDomains();

        expect(domainFindMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { verified: true },
            orderBy: { id: "asc" },
            skip: expectedPage * 50,
            take: 50,
        }));
    });
});
