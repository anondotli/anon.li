/**
 * DropService recipient management: plan gating (recipientControls),
 * the restrict toggle, ownership scoping, and revoke.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const {
    dropFindUnique,
    dropUpdate,
    userFindUnique,
    recipientCreate,
    recipientUpdateMany,
    recipientFindFirst,
    txn,
} = vi.hoisted(() => ({
    dropFindUnique: vi.fn(),
    dropUpdate: vi.fn(),
    userFindUnique: vi.fn(),
    recipientCreate: vi.fn(),
    recipientUpdateMany: vi.fn(),
    recipientFindFirst: vi.fn(),
    txn: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        drop: { findUnique: dropFindUnique, update: dropUpdate },
        user: { findUnique: userFindUnique },
        dropRecipient: {
            create: recipientCreate,
            updateMany: recipientUpdateMany,
            findFirst: recipientFindFirst,
        },
        $transaction: txn,
    },
}));

import { DropService } from "@/lib/services/drop";
import { UpgradeRequiredError, NotFoundError } from "@/lib/api-error-utils";
import { personalScope } from "@/lib/ownership";

const OWNER = "user-1";
const scope = personalScope(OWNER);

function ownedDrop(overrides: Record<string, unknown> = {}) {
    return { id: "drop-1", userId: OWNER, organizationId: null, customKey: false, restrictToRecipients: false, ...overrides };
}

function userWithTier(tier: "free" | "plus" | "pro") {
    const subscriptions =
        tier === "free"
            ? []
            : [{ status: "active", product: "drop", tier, currentPeriodEnd: new Date(Date.now() + 86_400_000) }];
    return { referralPlusUntil: null, subscriptions };
}

beforeEach(() => {
    vi.clearAllMocks();
    // $transaction([...creates]) resolves the array of create promises.
    txn.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));
    recipientCreate.mockImplementation(async ({ data }: { data: { email: string; label: string | null } }) => ({
        id: `rec-${data.email}`,
        email: data.email,
        label: data.label ?? null,
    }));
});

describe("DropService.addRecipients gating", () => {
    it("rejects a free user with UpgradeRequiredError (recipientControls is Plus+)", async () => {
        dropFindUnique.mockResolvedValue(ownedDrop());
        userFindUnique.mockResolvedValue(userWithTier("free"));

        await expect(
            DropService.addRecipients(scope, "drop-1", [{ email: "a@example.com" }]),
        ).rejects.toBeInstanceOf(UpgradeRequiredError);
        expect(recipientCreate).not.toHaveBeenCalled();
    });

    it("allows a Plus user and returns one raw token per recipient", async () => {
        dropFindUnique.mockResolvedValue(ownedDrop());
        userFindUnique.mockResolvedValue(userWithTier("plus"));

        const out = await DropService.addRecipients(scope, "drop-1", [
            { email: "a@example.com", label: "Alice" },
            { email: "b@example.com" },
        ]);

        expect(out).toHaveLength(2);
        expect(out[0]).toMatchObject({ email: "a@example.com", label: "Alice" });
        expect(out[0]!.token).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(out[0]!.token).not.toBe(out[1]!.token);
        // The raw token is never persisted — only its hash is in the create payload.
        const created = recipientCreate.mock.calls[0]?.[0]?.data;
        expect(created.tokenHash).toBeDefined();
        expect(created.tokenHash).not.toBe(out[0]!.token);
    });

    it("toggles restrictToRecipients when the option changes", async () => {
        dropFindUnique.mockResolvedValue(ownedDrop({ restrictToRecipients: false }));
        userFindUnique.mockResolvedValue(userWithTier("pro"));

        await DropService.addRecipients(scope, "drop-1", [{ email: "a@example.com" }], { restrict: true });
        expect(dropUpdate).toHaveBeenCalledWith({
            where: { id: "drop-1" },
            data: { restrictToRecipients: true },
        });
    });

    it("does not write the restrict flag when it is unchanged", async () => {
        dropFindUnique.mockResolvedValue(ownedDrop({ restrictToRecipients: true }));
        userFindUnique.mockResolvedValue(userWithTier("pro"));

        await DropService.addRecipients(scope, "drop-1", [{ email: "a@example.com" }], { restrict: true });
        expect(dropUpdate).not.toHaveBeenCalled();
    });

    it("404s when the drop belongs to another tenant", async () => {
        dropFindUnique.mockResolvedValue(ownedDrop({ userId: "someone-else" }));
        await expect(
            DropService.addRecipients(scope, "drop-1", [{ email: "a@example.com" }]),
        ).rejects.toBeInstanceOf(NotFoundError);
    });
});

describe("DropService.revokeRecipient", () => {
    it("sets revokedAt for an active recipient", async () => {
        dropFindUnique.mockResolvedValue(ownedDrop());
        recipientUpdateMany.mockResolvedValue({ count: 1 });

        await DropService.revokeRecipient(scope, "drop-1", "rec-1");
        expect(recipientUpdateMany).toHaveBeenCalledWith({
            where: { id: "rec-1", dropId: "drop-1", revokedAt: null },
            data: { revokedAt: expect.any(Date) },
        });
    });

    it("is idempotent when the recipient is already revoked", async () => {
        dropFindUnique.mockResolvedValue(ownedDrop());
        recipientUpdateMany.mockResolvedValue({ count: 0 });
        recipientFindFirst.mockResolvedValue({ id: "rec-1" }); // exists, just already revoked

        await expect(DropService.revokeRecipient(scope, "drop-1", "rec-1")).resolves.toBeUndefined();
    });

    it("404s when the recipient does not exist on the drop", async () => {
        dropFindUnique.mockResolvedValue(ownedDrop());
        recipientUpdateMany.mockResolvedValue({ count: 0 });
        recipientFindFirst.mockResolvedValue(null);

        await expect(DropService.revokeRecipient(scope, "drop-1", "rec-x")).rejects.toBeInstanceOf(NotFoundError);
    });
});
