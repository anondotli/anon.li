/**
 * DropService owner/recipient email side effects: download notifications,
 * the limit-reached email race guard, and the recipient "shared" sender name.
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const {
    txn,
    executeRaw,
    dropFindUnique,
    dropUpdate,
    userFindUnique,
    recipientCreate,
    sendEmail,
    sendDownloadLimitReachedEmail,
    sendDropSharedEmail,
} = vi.hoisted(() => ({
    txn: vi.fn(),
    executeRaw: vi.fn(),
    dropFindUnique: vi.fn(),
    dropUpdate: vi.fn(),
    userFindUnique: vi.fn(),
    recipientCreate: vi.fn(),
    sendEmail: vi.fn(),
    sendDownloadLimitReachedEmail: vi.fn(),
    sendDropSharedEmail: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        $transaction: txn,
        $executeRaw: executeRaw,
        drop: { findUnique: dropFindUnique, update: dropUpdate },
        user: { findUnique: userFindUnique },
        dropRecipient: { create: recipientCreate },
    },
}));

vi.mock("@/lib/resend", () => ({
    sendEmail,
    sendDownloadLimitReachedEmail,
    sendDropSharedEmail,
}));

// Capture the props the service renders the email with.
vi.mock("@/components/email/file-downloaded", () => ({
    FileDownloadedEmail: (props: unknown) => ({ props }),
}));

import { DropService } from "@/lib/services/drop";
import { personalScope } from "@/lib/ownership";

function committedDrop(overrides: Record<string, unknown> = {}) {
    return {
        id: "drop-1",
        userId: "user-1",
        notifyOnDownload: true,
        notificationsSent: 0,
        downloads: 1,
        maxDownloads: null,
        user: { id: "user-1", email: "owner@example.com", name: null },
        files: [],
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    // Interactive transaction: the global counter UPDATE succeeds.
    txn.mockImplementation(async (arg: unknown) => {
        if (typeof arg === "function") {
            return (arg as (tx: { $executeRaw: () => Promise<number> }) => Promise<boolean>)({
                $executeRaw: async () => 1,
            });
        }
        return Promise.all(arg as Promise<unknown>[]);
    });
    sendEmail.mockResolvedValue({ success: true });
    sendDownloadLimitReachedEmail.mockResolvedValue({ success: true });
    sendDropSharedEmail.mockResolvedValue({ success: true });
});

describe("download notification", () => {
    it("renders the download time in UTC and counts a delivered notification", async () => {
        dropFindUnique.mockResolvedValue(committedDrop());

        await expect(DropService.consumeDownload("drop-1")).resolves.toBe(true);

        expect(sendEmail).toHaveBeenCalledTimes(1);
        const props = sendEmail.mock.calls[0]?.[0]?.react?.props as { downloadTime: string };
        expect(props.downloadTime).toMatch(/GMT$/);
        expect(dropUpdate).toHaveBeenCalledWith({
            where: { id: "drop-1" },
            data: { notificationsSent: { increment: 1 } },
        });
    });

    it("does not count a notification whose send failed", async () => {
        dropFindUnique.mockResolvedValue(committedDrop());
        sendEmail.mockResolvedValue({ success: false, error: new Error("resend down") });

        await expect(DropService.consumeDownload("drop-1")).resolves.toBe(true);

        expect(sendEmail).toHaveBeenCalledTimes(1);
        expect(dropUpdate).not.toHaveBeenCalled();
    });
});

describe("download limit reached", () => {
    const limitDrop = committedDrop({ notifyOnDownload: false, downloads: 3, maxDownloads: 3 });

    it("emails the owner when this request's guarded soft-delete won", async () => {
        dropFindUnique.mockResolvedValue(limitDrop);
        executeRaw.mockResolvedValue(1);

        await DropService.consumeDownload("drop-1");

        expect(sendDownloadLimitReachedEmail).toHaveBeenCalledWith("owner@example.com", 3);
    });

    it("does not email when a concurrent request already soft-deleted the drop", async () => {
        dropFindUnique.mockResolvedValue(limitDrop);
        executeRaw.mockResolvedValue(0);

        await DropService.consumeDownload("drop-1");

        expect(executeRaw).toHaveBeenCalledTimes(1);
        expect(sendDownloadLimitReachedEmail).not.toHaveBeenCalled();
    });
});

describe("recipient shared email sender name", () => {
    const plusUser = {
        referralPlusUntil: null,
        subscriptions: [{ status: "active", product: "drop", tier: "plus", currentPeriodEnd: new Date(Date.now() + 86_400_000) }],
    };

    beforeEach(() => {
        dropFindUnique.mockResolvedValue({ id: "drop-1", userId: "user-1", organizationId: null, customKey: false, restrictToRecipients: false });
        recipientCreate.mockImplementation(async ({ data }: { data: { email: string } }) => ({
            id: `rec-${data.email}`,
            email: data.email,
            label: null,
        }));
    });

    it("never exposes the owner's login email when they have no display name", async () => {
        // The sender lookup selects only `name`; leak the email anyway so the
        // test proves the service never reads it.
        userFindUnique.mockImplementation(async ({ select }: { select?: Record<string, boolean> }) =>
            select?.name ? { name: null, email: "owner@example.com" } : plusUser,
        );

        await DropService.addRecipients(personalScope("user-1"), "drop-1", [{ email: "r@example.com" }], { notify: true });

        expect(sendDropSharedEmail).toHaveBeenCalledTimes(1);
        expect(sendDropSharedEmail.mock.calls[0]?.[2]).toBe("An anon.li user");
        expect(JSON.stringify(sendDropSharedEmail.mock.calls[0])).not.toContain("owner@example.com");
    });

    it("uses the owner's display name when set", async () => {
        userFindUnique.mockImplementation(async ({ select }: { select?: Record<string, boolean> }) =>
            select?.name ? { name: "Alice" } : plusUser,
        );

        await DropService.addRecipients(personalScope("user-1"), "drop-1", [{ email: "r@example.com" }], { notify: true });

        expect(sendDropSharedEmail.mock.calls[0]?.[2]).toBe("Alice");
    });
});
