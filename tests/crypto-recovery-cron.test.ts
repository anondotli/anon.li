/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
    expireInvoice,
    getInvoices,
    redisGet,
    redisSet,
    sendExpiredEmail,
    sendReminderEmail,
} = vi.hoisted(() => ({
    expireInvoice: vi.fn(),
    getInvoices: vi.fn(),
    redisGet: vi.fn(),
    redisSet: vi.fn(),
    sendExpiredEmail: vi.fn(),
    sendReminderEmail: vi.fn(),
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
});
