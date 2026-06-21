/**
 * Tests for the power-user (heavy free user) upsell cron.
 *
 * Regression guard for the conversion bug: the upsell email used to quote the
 * €6.99 Bundle price rendered as "$6.99" to alias-only power users, ~2.8x the
 * price they actually need. It must now anchor on Alias Plus, priced in EUR,
 * with the Bundle offered only as a secondary upsell.
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

    it("pitches Alias Plus priced in EUR — never the Bundle price or a $ sign", async () => {
        const result = await handleHeavyUserUpsellCron();

        expect(result.sent).toBe(1);
        expect(sendPowerUserUpsellEmail).toHaveBeenCalledTimes(1);

        const [email, userId, details] = vi.mocked(sendPowerUserUpsellEmail).mock.calls[0]!;
        expect(email).toBe(CANDIDATE.email);
        expect(userId).toBe(CANDIDATE.id);

        const expectedAliasPrice = `€${ALIAS_PLANS.plus.price.monthly.toFixed(2)}/mo`;
        const expectedBundlePrice = `€${BUNDLE_PLANS.plus.price.monthly.toFixed(2)}/mo`;

        expect(details.suggestedTier).toBe("plus");
        expect(details.aliasLimit).toBe(PLAN_ENTITLEMENTS.alias.plus.random);
        // Headline price = Alias Plus, in euros.
        expect(details.price).toBe(expectedAliasPrice);
        // Bundle is carried only as the secondary upsell.
        expect(details.bundlePrice).toBe(expectedBundlePrice);

        // Regression guards against the old bug.
        expect(details.price).toContain("€");
        expect(details.price).not.toContain("$");
        expect(details.price).not.toBe(expectedBundlePrice);
    });

    it("skips users already emailed within the cooldown window", async () => {
        redisGet.mockResolvedValue("1"); // dedupe key present

        const result = await handleHeavyUserUpsellCron();

        expect(result).toMatchObject({ sent: 0, skipped: 1 });
        expect(sendPowerUserUpsellEmail).not.toHaveBeenCalled();
    });
});
