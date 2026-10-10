/**
 * Tests for the power-user (heavy free user) upsell cron.
 *
 * Regression guard for the conversion bug: the upsell email used to quote the
 * Bundle price to alias-only power users, ~2.8x the price they actually need.
 * It must anchor on Alias Plus, priced in USD like the rest of the site, with
 * the Bundle offered only as a secondary upsell.
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ALIAS_PLANS, BUNDLE_PLANS, PLAN_ENTITLEMENTS } from "@/config/plans";

const { redisGet, redisSet } = vi.hoisted(() => ({
    redisGet: vi.fn(),
    redisSet: vi.fn(),
}));

vi.mock("@upstash/redis", () => ({
    Redis: class {
        get = redisGet;
        set = redisSet;
    },
}));

vi.mock("@/lib/data/user", () => ({
    getHeavyFreeUsers: vi.fn(),
}));

vi.mock("@/lib/resend", () => ({
    sendPowerUserUpsellEmail: vi.fn(),
}));

import { getHeavyFreeUsers } from "@/lib/data/user";
import { sendPowerUserUpsellEmail } from "@/lib/resend";
import { handleHeavyUserUpsellCron } from "@/lib/services/cron-heavy-user-upsell";

const CANDIDATE = {
    id: "u1",
    email: "power@example.com",
    aliasCount: 12,
    emailsForwarded: 240,
};

describe("handleHeavyUserUpsellCron", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        redisGet.mockResolvedValue(null); // not yet sent
        redisSet.mockResolvedValue("OK");
        vi.mocked(getHeavyFreeUsers).mockResolvedValue([CANDIDATE]);
        vi.mocked(sendPowerUserUpsellEmail).mockResolvedValue({
            success: true,
            data: { id: "test-email-id" },
        } as Awaited<ReturnType<typeof sendPowerUserUpsellEmail>>);
    });

    it("pitches Alias Plus priced in USD — never the Bundle price or a € sign", async () => {
        const result = await handleHeavyUserUpsellCron();

        expect(result.sent).toBe(1);
        expect(sendPowerUserUpsellEmail).toHaveBeenCalledTimes(1);

        const [email, userId, details] = vi.mocked(sendPowerUserUpsellEmail).mock.calls[0]!;
        expect(email).toBe(CANDIDATE.email);
        expect(userId).toBe(CANDIDATE.id);

        const expectedAliasPrice = `$${ALIAS_PLANS.plus.price.monthly.toFixed(2)}/mo`;
        const expectedBundlePrice = `$${BUNDLE_PLANS.plus.price.monthly.toFixed(2)}/mo`;

        expect(details.suggestedTier).toBe("plus");
        expect(details.aliasLimit).toBe(PLAN_ENTITLEMENTS.alias.plus.random);
        // Headline price = Alias Plus, in US dollars (the site's billing currency).
        expect(details.price).toBe(expectedAliasPrice);
        // Bundle is carried only as the secondary upsell.
        expect(details.bundlePrice).toBe(expectedBundlePrice);

        // Regression guards.
        expect(details.price).not.toContain("€");
        expect(details.price).not.toBe(expectedBundlePrice);
    });

    it("skips users already emailed within the cooldown window", async () => {
        redisGet.mockResolvedValue("1"); // dedupe key present

        const result = await handleHeavyUserUpsellCron();

        expect(result).toMatchObject({ sent: 0, skipped: 1 });
        expect(sendPowerUserUpsellEmail).not.toHaveBeenCalled();
    });
});

describe("handleHeavyUserUpsellCron pagination", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        redisSet.mockResolvedValue("OK");
        vi.mocked(sendPowerUserUpsellEmail).mockResolvedValue({
            success: true,
            data: { id: "test-email-id" },
        } as Awaited<ReturnType<typeof sendPowerUserUpsellEmail>>);
    });

    it("pages past users in cooldown so lower-ranked users are not starved", async () => {
        const fullPage = Array.from({ length: 200 }, (_, i) => ({ ...CANDIDATE, id: `cool-${i}` }));
        const fresh = { ...CANDIDATE, id: "fresh", email: "fresh@example.com" };
        vi.mocked(getHeavyFreeUsers)
            .mockResolvedValueOnce(fullPage)
            .mockResolvedValueOnce([fresh]);
        redisGet.mockImplementation(async (key: string) => (key.endsWith(":fresh") ? null : "1"));

        const result = await handleHeavyUserUpsellCron();

        expect(getHeavyFreeUsers).toHaveBeenNthCalledWith(1, expect.objectContaining({ offset: 0, limit: 200 }));
        expect(getHeavyFreeUsers).toHaveBeenNthCalledWith(2, expect.objectContaining({ offset: 200, limit: 200 }));
        expect(result).toMatchObject({ sent: 1, skipped: 200 });
        expect(sendPowerUserUpsellEmail).toHaveBeenCalledWith("fresh@example.com", "fresh", expect.anything());
    });
});
