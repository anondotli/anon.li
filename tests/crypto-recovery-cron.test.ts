/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
    expireInvoice,
    getInvoices,
    postHogCapture,
    postHogFlush,
    redisGet,
    redisSet,
    sendExpiredEmail,
    sendReminderEmail,
} = vi.hoisted(() => ({
    expireInvoice: vi.fn(),
    getInvoices: vi.fn(),
    postHogCapture: vi.fn(),
    postHogFlush: vi.fn().mockResolvedValue(undefined),
    redisGet: vi.fn(),
    redisSet: vi.fn(),
    sendExpiredEmail: vi.fn(),
    sendReminderEmail: vi.fn(),
}));

vi.mock("posthog-node", () => ({
    PostHog: class MockPostHog {
        capture = postHogCapture;
        captureException = vi.fn();
        flush = postHogFlush;
    },
}));
vi.mock("@upstash/redis", () => ({
    Redis: class {
        get = redisGet;
        set = redisSet;
    },
}));
vi.mock("@/lib/data/crypto-payment", () => ({
    expireCryptoInvoice: expireInvoice,
    getRecoverableCryptoInvoices: getInvoices,
}));
vi.mock("@/lib/resend", () => ({
    sendCryptoInvoiceExpiredEmail: sendExpiredEmail,
    sendCryptoInvoiceReminderEmail: sendReminderEmail,
}));

import { handleCryptoRecoveryCron } from "@/lib/services/cron-crypto-recovery";

const expiredInvoice = {
    id: "invoice-1",
    orderId: "crypto_ord_1",
    userId: "user-1",
    product: "bundle",
    tier: "plus",
    priceAmount: 9.99,
    payCurrency: "btc",
    createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    status: "expired" as const,
    user: { email: "user@example.com" },
};

describe("crypto recovery cron", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
        redisGet.mockResolvedValue(null);
        redisSet.mockResolvedValue("OK");
        sendExpiredEmail.mockResolvedValue({ success: true });
        sendReminderEmail.mockResolvedValue({ success: true });
        expireInvoice.mockResolvedValue({ count: 1 });
        getInvoices.mockResolvedValue([expiredInvoice]);
    });

    it("retries a previously expired invoice whose email was not deduplicated", async () => {
        const result = await handleCryptoRecoveryCron();

        expect(expireInvoice).not.toHaveBeenCalled();
        expect(sendExpiredEmail).toHaveBeenCalledWith(
            expiredInvoice.user.email,
            expect.objectContaining({ product: expiredInvoice.product }),
            `crypto-invoice-expired/${expiredInvoice.id}`,
        );
        expect(result).toMatchObject({ expired: 0, expiredEmailsSent: 1, errors: 0 });
    });

    it("atomically expires a waiting invoice before notifying", async () => {
        getInvoices.mockResolvedValue([{ ...expiredInvoice, status: "waiting" }]);

        const result = await handleCryptoRecoveryCron();

        expect(expireInvoice).toHaveBeenCalledWith(expiredInvoice.id);
        expect(sendExpiredEmail).toHaveBeenCalledOnce();
        expect(result).toMatchObject({ expired: 1, expiredEmailsSent: 1, errors: 0 });
    });

    it("emits crypto_invoice_expired (source: cron) when flipping a waiting invoice", async () => {
        getInvoices.mockResolvedValue([{ ...expiredInvoice, status: "waiting" }]);

        await handleCryptoRecoveryCron();

        expect(postHogCapture).toHaveBeenCalledWith(expect.objectContaining({
            distinctId: expiredInvoice.userId,
            event: "crypto_invoice_expired",
            properties: expect.objectContaining({
                source: "cron",
                order_id: expiredInvoice.orderId,
            }),
        }));
        expect(postHogFlush).toHaveBeenCalled();
    });

    it("reminds a waiting invoice and reports its pending hours", async () => {
        const waitingInvoice = {
            ...expiredInvoice,
            id: "invoice-waiting",
            status: "waiting" as const,
            createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        };
        getInvoices.mockResolvedValue([waitingInvoice]);

        const result = await handleCryptoRecoveryCron();

        expect(sendReminderEmail).toHaveBeenCalledWith(
            waitingInvoice.user.email,
            expect.objectContaining({
                product: waitingInvoice.product,
                tier: waitingInvoice.tier,
                hoursPending: 3,
            }),
            `crypto-invoice-reminder/${waitingInvoice.id}`,
        );
        expect(sendExpiredEmail).not.toHaveBeenCalled();
        expect(result).toMatchObject({ remindersSent: 1, expired: 0, errors: 0 });
    });

    it("queries for invoices pending longer than the 2-hour reminder threshold", async () => {
        getInvoices.mockResolvedValue([]);

        await handleCryptoRecoveryCron();

        expect(getInvoices).toHaveBeenCalledTimes(1);
        const opts = getInvoices.mock.calls[0]![0] as { createdBefore: Date };
        const ageMs = Date.now() - opts.createdBefore.getTime();
        // 2 h threshold, with tolerance for run time.
        expect(ageMs).toBeGreaterThanOrEqual(2 * 60 * 60 * 1000 - 5_000);
        expect(ageMs).toBeLessThan(2 * 60 * 60 * 1000 + 60_000);
    });

    it("sends only one reminder per invoice via the dedupe key", async () => {
        const waitingInvoice = {
            ...expiredInvoice,
            id: "invoice-duped",
            status: "waiting" as const,
            createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
        };
        getInvoices.mockResolvedValue([waitingInvoice]);
        redisGet.mockResolvedValue("1");

        const result = await handleCryptoRecoveryCron();

        expect(sendReminderEmail).not.toHaveBeenCalled();
        expect(result).toMatchObject({ remindersSent: 0, errors: 0 });
    });
});
