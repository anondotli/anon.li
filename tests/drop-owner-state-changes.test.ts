/**
 * DropService owner-side state changes (toggle / set disabled / delete):
 * soft-deleted drops are never touched, the `standaloneOnly` surface (public
 * API + MCP) refuses form attachment/staging drops, and internal form cleanup
 * can still hard-delete any drop it owns.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { dropFindFirst, dropFindUnique, dropUpdate, dropDeleteMany, dropFindMany, dropCount } = vi.hoisted(() => ({
    dropFindMany: vi.fn(),
    dropCount: vi.fn(),
    dropFindFirst: vi.fn(),
    dropFindUnique: vi.fn(),
    dropUpdate: vi.fn(),
    dropDeleteMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        drop: {
            findFirst: dropFindFirst,
            findUnique: dropFindUnique,
            update: dropUpdate,
            deleteMany: dropDeleteMany,
            findMany: dropFindMany,
            count: dropCount,
        },
    },
}));

import { DropService, standaloneDropWhere } from "@/lib/services/drop";
import { NotFoundError } from "@/lib/api-error-utils";
import { personalScope } from "@/lib/ownership";

const scope = personalScope("user-1");

function ownedDrop(overrides: Record<string, unknown> = {}) {
    return { id: "drop-1", userId: "user-1", organizationId: null, disabled: false, ...overrides };
}

// The storage/quota side effect is covered elsewhere; here we only need to
// know whether the delete went ahead.
const reclaim = vi
    .spyOn(DropService as unknown as { deleteFilesAndReclaimQuota: (id: string) => Promise<void> }, "deleteFilesAndReclaimQuota")
    .mockResolvedValue(undefined);

beforeEach(() => {
    vi.clearAllMocks();
    reclaim.mockResolvedValue(undefined);
});

describe("DropService.toggleDrop", () => {
    it("never matches a soft-deleted drop", async () => {
        dropFindFirst.mockResolvedValueOnce(null);
        await expect(DropService.toggleDrop("drop-1", scope)).rejects.toBeInstanceOf(NotFoundError);
        expect(dropFindFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: "drop-1", deletedAt: null },
        }));
        expect(dropUpdate).not.toHaveBeenCalled();
    });

    it("scopes the lookup to live standalone drops with standaloneOnly", async () => {
        dropFindFirst.mockResolvedValueOnce(ownedDrop({ disabled: true }));
        await expect(DropService.toggleDrop("drop-1", scope, { standaloneOnly: true })).resolves.toBe(false);
        expect(dropFindFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: "drop-1", ...standaloneDropWhere(scope) },
        }));
        expect(dropUpdate).toHaveBeenCalledWith({
            where: { id: "drop-1" },
            data: { disabled: false, disabledAt: null },
        });
    });

    it("reports a form attachment as NOT_FOUND on the standalone surface", async () => {
        // standaloneDropWhere excludes formSubmission/formStagingId/form upload-token drops.
        dropFindFirst.mockResolvedValueOnce(null);
        await expect(DropService.toggleDrop("attachment-1", scope, { standaloneOnly: true }))
            .rejects.toBeInstanceOf(NotFoundError);
        expect(dropUpdate).not.toHaveBeenCalled();
    });

    it("hides another user's drop as NOT_FOUND", async () => {
        dropFindFirst.mockResolvedValueOnce(ownedDrop({ userId: "someone-else" }));
        await expect(DropService.toggleDrop("drop-1", scope)).rejects.toBeInstanceOf(NotFoundError);
        expect(dropUpdate).not.toHaveBeenCalled();
    });
});

describe("DropService.setDropDisabled", () => {
    it("sets the requested state without flipping", async () => {
        dropFindFirst.mockResolvedValueOnce(ownedDrop({ disabled: false }));
        await expect(DropService.setDropDisabled("drop-1", scope, true, { standaloneOnly: true })).resolves.toBe(true);
        expect(dropUpdate).toHaveBeenCalledWith({
            where: { id: "drop-1" },
            data: { disabled: true, disabledAt: expect.any(Date) },
        });
    });

    it("is a no-op write when the drop is already in that state", async () => {
        dropFindFirst.mockResolvedValueOnce(ownedDrop({ disabled: true }));
        await expect(DropService.setDropDisabled("drop-1", scope, true)).resolves.toBe(true);
        expect(dropUpdate).not.toHaveBeenCalled();
    });
});

describe("DropService.deleteDrop", () => {
    it("refuses soft-deleted and form-owned drops on the standalone surface", async () => {
        dropFindFirst.mockResolvedValueOnce(null);
        await expect(DropService.deleteDrop("drop-1", scope, { standaloneOnly: true }))
            .rejects.toBeInstanceOf(NotFoundError);
        expect(dropFindFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: "drop-1", ...standaloneDropWhere(scope) },
        }));
        expect(reclaim).not.toHaveBeenCalled();
        expect(dropDeleteMany).not.toHaveBeenCalled();
    });

    it("deletes a live standalone drop", async () => {
        dropFindFirst.mockResolvedValueOnce(ownedDrop());
        await DropService.deleteDrop("drop-1", scope, { standaloneOnly: true });
        expect(reclaim).toHaveBeenCalledWith("drop-1");
        expect(dropDeleteMany).toHaveBeenCalledWith({ where: { id: "drop-1" } });
    });

    it("still lets internal form cleanup hard-delete an attachment, even once soft-deleted", async () => {
        dropFindUnique.mockResolvedValueOnce({ id: "attachment-1", userId: "user-1", organizationId: null });
        await DropService.deleteDrop("attachment-1", scope);
        expect(dropFindFirst).not.toHaveBeenCalled();
        expect(dropFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "attachment-1" } }));
        expect(reclaim).toHaveBeenCalledWith("attachment-1");
        expect(dropDeleteMany).toHaveBeenCalledWith({ where: { id: "attachment-1" } });
    });
});

describe("DropService.listDrops", () => {
    it("breaks createdAt ties by id so offset pages are stable", async () => {
        dropFindMany.mockResolvedValueOnce([]);
        dropCount.mockResolvedValueOnce(0);
        await DropService.listDrops(scope, { limit: 10, offset: 20 });
        expect(dropFindMany).toHaveBeenCalledWith(expect.objectContaining({
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 10,
            skip: 20,
        }));
    });
});
