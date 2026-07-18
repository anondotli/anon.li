/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
    billingCron,
    cryptoRecoveryCron,
    domainsCron,
    dripCron,
    heavyUserCron,
    lockNames,
} = vi.hoisted(() => ({
    billingCron: vi.fn(),
    cryptoRecoveryCron: vi.fn(),
    domainsCron: vi.fn(),
    dripCron: vi.fn(),
    heavyUserCron: vi.fn(),
    lockNames: [] as string[],
}));

vi.mock("@/lib/cron-lock", () => ({
    withCronLock: vi.fn(async (name: string, _ttl: number, job: () => unknown) => {
        lockNames.push(name);
        return job();
    }),
}));
vi.mock("@/lib/services/cron-billing", () => ({ handleBillingCron: billingCron }));
vi.mock("@/lib/services/cron-crypto-recovery", () => ({ handleCryptoRecoveryCron: cryptoRecoveryCron }));
vi.mock("@/lib/services/cron-domains", () => ({ handleDomainsCron: domainsCron }));
vi.mock("@/lib/services/cron-drip", () => ({ handleDripCron: dripCron }));
vi.mock("@/lib/services/cron-heavy-user-upsell", () => ({ handleHeavyUserUpsellCron: heavyUserCron }));

import { GET as runBilling } from "@/app/api/cron/billing/route";
import { GET as runCryptoRecovery } from "@/app/api/cron/crypto-recovery/route";
import { GET as runDomains } from "@/app/api/cron/domains/route";
import { GET as runDrip } from "@/app/api/cron/drip/route";
import { GET as runHeavyUserUpsell } from "@/app/api/cron/heavy-user-upsell/route";

const originalSecret = process.env.CRON_SECRET;
const authorizedRequest = (path: string) => new Request(`https://example.com${path}`, {
    headers: { authorization: "Bearer test-cron-secret" },
});

describe("dedicated cron routes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        lockNames.length = 0;
        process.env.CRON_SECRET = "test-cron-secret";
        billingCron.mockResolvedValue({
            scheduling: { processed: 0, errors: 0 },
            deletion: { processed: 0, errors: 0 },
            cryptoReminders: { sent: 0, errors: 0 },
            reconciliation: { checked: 0, revoked: 0, refreshed: 0, errors: 0 },
        });
        cryptoRecoveryCron.mockResolvedValue({ remindersSent: 0, expired: 0, expiredEmailsSent: 0, errors: 0 });
        domainsCron.mockResolvedValue({
            cleanup: { deleted: 0, errors: 0 },
            reverify: { checked: 0, revoked: 0, errors: 0 },
        });
        dripCron.mockResolvedValue({ day1: { sent: 0, skipped: 0, errors: 0 } });
        heavyUserCron.mockResolvedValue({ sent: 0, skipped: 0, errors: 0 });
    });

    afterEach(() => {
        process.env.CRON_SECRET = originalSecret;
    });

    it("uses an independent distributed lock for each workload", async () => {
        const responses = await Promise.all([
            runDomains(authorizedRequest("/api/cron/domains")),
            runBilling(authorizedRequest("/api/cron/billing") as never),
            runDrip(authorizedRequest("/api/cron/drip") as never),
            runCryptoRecovery(authorizedRequest("/api/cron/crypto-recovery") as never),
            runHeavyUserUpsell(authorizedRequest("/api/cron/heavy-user-upsell") as never),
        ]);

        expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200, 200]);
        expect(lockNames).toEqual(expect.arrayContaining([
            "domains",
            "billing",
            "drip",
            "crypto-recovery",
            "heavy-user-upsell",
        ]));
        expect(new Set(lockNames).size).toBe(5);
    });

    it.each([
        ["domains", () => {
            domainsCron.mockResolvedValue({
                cleanup: { deleted: 0, errors: 1 },
                reverify: { checked: 0, revoked: 0, errors: 0 },
            });
            return runDomains(authorizedRequest("/api/cron/domains"));
        }],
        ["billing", () => {
            billingCron.mockResolvedValue({
                scheduling: { processed: 0, errors: 1 },
                deletion: { processed: 0, errors: 0 },
                cryptoReminders: { sent: 0, errors: 0 },
                reconciliation: { checked: 0, revoked: 0, refreshed: 0, errors: 0 },
            });
            return runBilling(authorizedRequest("/api/cron/billing") as never);
        }],
        ["drip", () => {
            dripCron.mockResolvedValue({ day1: { sent: 0, skipped: 0, errors: 1 } });
            return runDrip(authorizedRequest("/api/cron/drip") as never);
        }],
        ["crypto recovery", () => {
            cryptoRecoveryCron.mockResolvedValue({ remindersSent: 0, expired: 0, expiredEmailsSent: 0, errors: 1 });
            return runCryptoRecovery(authorizedRequest("/api/cron/crypto-recovery") as never);
        }],
        ["heavy-user upsell", () => {
            heavyUserCron.mockResolvedValue({ sent: 0, skipped: 0, errors: 1 });
            return runHeavyUserUpsell(authorizedRequest("/api/cron/heavy-user-upsell") as never);
        }],
    ])("returns HTTP 500 when %s reports partial failures", async (_name, run) => {
        const response = await run();
        const body = await response.json();

        expect(response.status).toBe(500);
        expect(body.success).toBe(false);
    });
});
