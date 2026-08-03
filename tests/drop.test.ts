/**
 * Tests for Drop Service
 * @vitest-environment node
 */
import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";

import { DropService } from "@/lib/services/drop";
import { prisma } from "@/lib/prisma";
import * as storage from "@/lib/storage";
import * as dropUtils from "@/lib/drop-utils";
import { getOrgLimitContext } from "@/lib/data/auth";
import { orgScope, personalScope } from "@/lib/ownership";

// Mock dependencies
vi.mock("@/lib/prisma", () => ({
    prisma: {
        $transaction: vi.fn(),
        $executeRaw: vi.fn().mockResolvedValue(1),
        $queryRaw: vi.fn().mockResolvedValue([{ deleted: true }]),
        dropFile: {
            findUnique: vi.fn(),
            update: vi.fn(),
            create: vi.fn(),
            count: vi.fn(),
            aggregate: vi.fn(),
            delete: vi.fn(),
            deleteMany: vi.fn(),
        },
        uploadChunk: {
            update: vi.fn(),
            createMany: vi.fn(),
        },
        user: {
            update: vi.fn(),
        },
        dropSession: {
            findFirst: vi.fn(),
        },
        drop: {
            findUnique: vi.fn(),
            update: vi.fn(),
            count: vi.fn(),
        },
        orphanedFile: {
            create: vi.fn(),
        },
    },
}));

vi.mock("@/lib/storage", () => ({
    abortMultipartUpload: vi.fn(),
    completeMultipartUpload: vi.fn(),
    getPresignedDownloadUrl: vi.fn(),
    getObjectMetadata: vi.fn(),
    deleteObject: vi.fn(),
    generateStorageKey: vi.fn(),
    initiateMultipartUpload: vi.fn(),
}));

vi.mock("@/lib/drop-utils", () => ({
    calculateExpiry: vi.fn(),
    getUserAndLimits: vi.fn(),
    validateFileSize: vi.fn(),
    validateInputLengths: vi.fn(),
    enforceFeatureFlags: vi.fn(),
    generateSessionToken: vi.fn(),
    storeDropSession: vi.fn(),
    verifyDropSession: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/data/auth", () => ({
    getOrgLimitContext: vi.fn().mockResolvedValue({ subscriptions: [], storageUsed: BigInt(0) }),
}));

vi.mock("@/lib/limits", () => ({
    getDropLimits: vi.fn().mockReturnValue({
        maxStorage: 1_000_000,
        maxFileSize: 1_000_000,
        maxExpiry: 7,
        features: {},
    }),
    getEffectiveTier: vi.fn().mockReturnValue("pro"),
    assertOrgPlanActive: vi.fn(),
}));

 

describe("DropService.completeFileUpload", () => {
    type FinalizationState = {
        id: string;
        declaredSize: bigint;
        storageKey: string;
        s3UploadId: string;
        uploadComplete: boolean;
        dropId: string;
        ownerUserId: string | null;
        organizationId: string | null;
        dropDeletedAt: Date | null;
        deleted?: boolean;
    };

    function pendingFile(overrides: Partial<FinalizationState> = {}): FinalizationState {
        return {
            id: "file-123",
            declaredSize: BigInt(1024),
            storageKey: "d/fi/file-123",
            s3UploadId: "upload-123",
            uploadComplete: false,
            dropId: "drop-123",
            ownerUserId: "user-123",
            organizationId: null,
            dropDeletedAt: null,
            ...overrides,
        };
    }

    function installFinalizationTransaction(
        state: FinalizationState,
        { serialize = false }: { serialize?: boolean } = {},
    ) {
        const queryRaw = vi.fn().mockImplementation(async () => state.deleted ? [] : [{ ...state }]);
        const findMany = vi.fn().mockResolvedValue([
            { chunkIndex: 0, etag: "etag-1", completed: true },
        ]);
        const update = vi.fn().mockImplementation(async ({ data }) => {
            state.uploadComplete = data.uploadComplete;
            state.declaredSize = data.size;
            return { id: state.id };
        });
        const remove = vi.fn().mockImplementation(async () => {
            state.deleted = true;
            return { id: state.id };
        });
        const executeRaw = vi.fn().mockResolvedValue(1);
        const tx = {
            $queryRaw: queryRaw,
            $executeRaw: executeRaw,
            uploadChunk: { findMany },
            dropFile: { update, delete: remove },
        };

        let lockTail = Promise.resolve();
        (prisma.$transaction as unknown as ReturnType<typeof vi.fn>).mockImplementation(
            async (callback: (client: typeof tx) => Promise<unknown>) => {
                if (!serialize) return callback(tx);
                const previous = lockTail;
                let release: () => void = () => undefined;
                lockTail = new Promise<void>((resolve) => { release = resolve; });
                await previous;
                try {
                    return await callback(tx);
                } finally {
                    release();
                }
            },
        );

        return { queryRaw, findMany, update, remove, executeRaw };
    }

    beforeEach(() => {
        vi.clearAllMocks();
        (storage.completeMultipartUpload as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
        (storage.getObjectMetadata as ReturnType<typeof vi.fn>).mockResolvedValue({
            contentLength: 1024,
            contentType: "application/octet-stream",
        });
        (storage.abortMultipartUpload as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
        (storage.deleteObject as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    });

    it("commits success once and makes a sequential retry a no-op", async () => {
        const state = pendingFile();
        const harness = installFinalizationTransaction(state);

        await DropService.completeFileUpload(state.id, personalScope("user-123"));
        await DropService.completeFileUpload(state.id, personalScope("user-123"));

        expect(storage.completeMultipartUpload).toHaveBeenCalledTimes(1);
        expect(storage.getObjectMetadata).toHaveBeenCalledTimes(1);
        expect(harness.update).toHaveBeenCalledTimes(1);
        expect(harness.update).toHaveBeenCalledWith({
            where: { id: state.id },
            data: { uploadComplete: true, size: BigInt(1024) },
        });
        expect(harness.executeRaw).not.toHaveBeenCalled();
        expect(harness.remove).not.toHaveBeenCalled();
        expect(storage.abortMultipartUpload).not.toHaveBeenCalled();
        expect(storage.deleteObject).not.toHaveBeenCalled();
        expect(prisma.$transaction).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({ timeout: 120_000 }),
        );
    });

    it("serializes concurrent callers so only the lock winner completes R2", async () => {
        const state = pendingFile();
        const harness = installFinalizationTransaction(state, { serialize: true });
        let releaseComplete: () => void = () => undefined;
        (storage.completeMultipartUpload as ReturnType<typeof vi.fn>).mockImplementation(
            () => new Promise<void>((resolve) => { releaseComplete = resolve; }),
        );

        const first = DropService.completeFileUpload(state.id, personalScope("user-123"));
        await vi.waitFor(() => expect(storage.completeMultipartUpload).toHaveBeenCalledTimes(1));
        const second = DropService.completeFileUpload(state.id, personalScope("user-123"));
        await Promise.resolve();
        expect(harness.queryRaw).toHaveBeenCalledTimes(1);

        releaseComplete();
        await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
        expect(harness.queryRaw).toHaveBeenCalledTimes(2);
        expect(storage.completeMultipartUpload).toHaveBeenCalledTimes(1);
        expect(storage.getObjectMetadata).toHaveBeenCalledTimes(1);
        expect(harness.update).toHaveBeenCalledTimes(1);
        expect(harness.remove).not.toHaveBeenCalled();
    });

    it("reconciles an ambiguous Complete error when HEAD finds a valid object", async () => {
        const state = pendingFile();
        const harness = installFinalizationTransaction(state);
        (storage.completeMultipartUpload as ReturnType<typeof vi.fn>)
            .mockRejectedValue(new Error("connection reset after commit"));

        await expect(DropService.completeFileUpload(state.id, personalScope("user-123")))
            .resolves.toBeUndefined();
        expect(storage.getObjectMetadata).toHaveBeenCalledTimes(1);
        expect(harness.update).toHaveBeenCalledTimes(1);
        expect(harness.remove).not.toHaveBeenCalled();
        expect(storage.deleteObject).not.toHaveBeenCalled();
    });

    it("preserves pending state when reconciliation is transient", async () => {
        const state = pendingFile();
        const harness = installFinalizationTransaction(state);
        const completeError = new Error("connection reset after commit");
        (storage.completeMultipartUpload as ReturnType<typeof vi.fn>).mockRejectedValue(completeError);
        (storage.getObjectMetadata as ReturnType<typeof vi.fn>).mockResolvedValue(null);

        await expect(DropService.completeFileUpload(state.id, personalScope("user-123")))
            .rejects.toBe(completeError);
        expect(state.uploadComplete).toBe(false);
        expect(harness.update).not.toHaveBeenCalled();
        expect(harness.remove).not.toHaveBeenCalled();
        expect(harness.executeRaw).not.toHaveBeenCalled();
        expect(storage.abortMultipartUpload).not.toHaveBeenCalled();
        expect(storage.deleteObject).not.toHaveBeenCalled();
    });

    it("rejects an undersized org object and credits the team's full reservation", async () => {
        const state = pendingFile({
            id: "org-file",
            declaredSize: BigInt(1100),
            storageKey: "d/fi/org-file",
            dropId: "org-drop",
            ownerUserId: "creator-user",
            organizationId: "org-1",
        });
        const harness = installFinalizationTransaction(state);
        (storage.getObjectMetadata as ReturnType<typeof vi.fn>).mockResolvedValue({
            contentLength: 1000,
            contentType: "application/octet-stream",
        });

        await expect(DropService.completeFileUpload(
            state.id,
            orgScope("collaborating-member", "org-1", "member"),
        )).rejects.toThrow("uploaded less than declared");
        expect(harness.remove).toHaveBeenCalledWith({ where: { id: state.id } });
        expect(harness.executeRaw.mock.calls[0]?.[1]).toBe(BigInt(1100));
        expect(harness.executeRaw.mock.calls[0]?.[2]).toBe("org-1");
        expect(harness.update).not.toHaveBeenCalled();
        expect(storage.abortMultipartUpload).toHaveBeenCalledWith("d/fi/org-file", "upload-123");
        expect(storage.deleteObject).toHaveBeenCalledWith("d/fi/org-file");
    });

    it("rejects even a one-byte short small object", async () => {
        const state = pendingFile({ declaredSize: BigInt(20) });
        const harness = installFinalizationTransaction(state);
        (storage.getObjectMetadata as ReturnType<typeof vi.fn>).mockResolvedValue({
            contentLength: 19,
            contentType: "application/octet-stream",
        });

        await expect(DropService.completeFileUpload(state.id, personalScope("user-123")))
            .rejects.toThrow("uploaded less than declared");
        expect(harness.remove).toHaveBeenCalledWith({ where: { id: state.id } });
        expect(harness.executeRaw.mock.calls[0]?.[1]).toBe(BigInt(20));
        expect(harness.update).not.toHaveBeenCalled();
    });

    it("claims a definite size violation before cleaning up storage", async () => {
        const state = pendingFile({ id: "file-oversized", storageKey: "d/fi/file-oversized" });
        const harness = installFinalizationTransaction(state);
        (storage.getObjectMetadata as ReturnType<typeof vi.fn>).mockResolvedValue({
            contentLength: 2048,
            contentType: "application/octet-stream",
        });

        await expect(DropService.completeFileUpload(state.id, personalScope("user-123")))
            .rejects.toThrow("File size mismatch");
        expect(harness.remove).toHaveBeenCalledWith({ where: { id: state.id } });
        expect(harness.executeRaw.mock.calls[0]?.[1]).toBe(BigInt(1024));
        expect(harness.executeRaw.mock.calls[0]?.[2]).toBe("user-123");
        expect(harness.remove.mock.invocationCallOrder[0]).toBeLessThan(
            (storage.abortMultipartUpload as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!,
        );
        expect(storage.abortMultipartUpload).toHaveBeenCalledWith("d/fi/file-oversized", "upload-123");
        expect(storage.deleteObject).toHaveBeenCalledWith("d/fi/file-oversized");
        expect(harness.update).not.toHaveBeenCalled();
    });
});

describe("DropService.addFile authenticated quota owner", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("charges the pooled organization quota and locks the parent before inserting a file", async () => {
        const drop = {
            id: "org-drop",
            userId: "creator-user",
            organizationId: "org-1",
            deletedAt: null,
            uploadComplete: false,
            maxFileCount: 10,
            _count: { files: 0 },
        };
        (prisma.drop.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(drop);
        (prisma.dropFile.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
        (prisma.drop.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
        (dropUtils.getUserAndLimits as ReturnType<typeof vi.fn>).mockResolvedValue({
            storageUsed: BigInt(0),
            limits: { maxStorage: 1_000_000, maxFileSize: 1_000_000 },
            tier: "pro",
        });
        (getOrgLimitContext as ReturnType<typeof vi.fn>).mockResolvedValue({
            subscriptions: [{ status: "active", product: "business", tier: "pro" }],
            storageUsed: BigInt(20),
        });
        (storage.generateStorageKey as ReturnType<typeof vi.fn>).mockReturnValue("drop/file-1");
        (storage.initiateMultipartUpload as ReturnType<typeof vi.fn>).mockResolvedValue("upload-1");

        const txQueryRaw = vi.fn().mockResolvedValue([drop]);
        const txExecuteRaw = vi.fn().mockResolvedValue(1);
        const txDropFileCount = vi.fn().mockResolvedValue(0);
        const txDropFileCreate = vi.fn().mockResolvedValue({ id: "file-1" });
        const txChunkCreateMany = vi.fn().mockResolvedValue({ count: 1 });
        (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
            async (callback: (tx: unknown) => Promise<unknown>) => callback({
                $queryRaw: txQueryRaw,
                $executeRaw: txExecuteRaw,
                dropFile: { count: txDropFileCount, create: txDropFileCreate },
                uploadChunk: { createMany: txChunkCreateMany },
            }),
        );

        await DropService.addFile(
            orgScope("collaborating-member", "org-1", "member"),
            {
                dropId: "org-drop",
                encryptedName: "encrypted",
                iv: "1234567890123456",
                size: 128,
                mimeType: "application/octet-stream",
                chunkCount: 1,
                chunkSize: 128,
            },
        );

        expect(dropUtils.getUserAndLimits).toHaveBeenCalledWith("collaborating-member");
        expect(getOrgLimitContext).toHaveBeenCalledWith("org-1");
        const reserveSql = (txExecuteRaw.mock.calls[0]?.[0] as TemplateStringsArray).join("?");
        expect(reserveSql).toContain('UPDATE "organizations"');
        expect(reserveSql).not.toContain('UPDATE "users"');
        expect(txExecuteRaw.mock.calls[0]?.[2]).toBe("org-1");
        const lockSql = (txQueryRaw.mock.calls[0]?.[0] as TemplateStringsArray).join("?");
        expect(lockSql).toContain("FOR UPDATE");
        expect(txQueryRaw.mock.invocationCallOrder[0]).toBeLessThan(
            txExecuteRaw.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
        );
        expect(txExecuteRaw.mock.invocationCallOrder[0]).toBeLessThan(
            txDropFileCreate.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
        );
        expect(txDropFileCreate).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ dropId: "org-drop", size: BigInt(128) }),
        }));
    });

    it("rechecks the whole Form attachment cap while holding the parent lock", async () => {
        const drop = {
            id: "form-drop",
            userId: "owner-1",
            organizationId: null,
            deletedAt: null,
            uploadComplete: false,
            maxFileCount: 10,
            _count: { files: 1 },
        };
        (prisma.drop.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(drop);
        (prisma.dropFile.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);
        (prisma.drop.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
        (dropUtils.getUserAndLimits as ReturnType<typeof vi.fn>).mockResolvedValue({
            storageUsed: BigInt(0),
            limits: { maxStorage: 10_000, maxFileSize: 10_000 },
            tier: "pro",
        });
        (storage.generateStorageKey as ReturnType<typeof vi.fn>).mockReturnValue("drop/file-2");
        (storage.initiateMultipartUpload as ReturnType<typeof vi.fn>).mockResolvedValue("upload-2");
        (storage.abortMultipartUpload as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

        const txExecuteRaw = vi.fn().mockResolvedValue(1);
        const txDropFileCreate = vi.fn();
        const txDropFileFindMany = vi.fn().mockResolvedValue([
            { size: BigInt(70), chunkCount: 1 }, // 54 plaintext bytes
        ]);
        (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
            async (callback: (tx: unknown) => Promise<unknown>) => callback({
                $queryRaw: vi.fn().mockResolvedValue([drop]),
                $executeRaw: txExecuteRaw,
                dropFile: {
                    count: vi.fn().mockResolvedValue(1),
                    findMany: txDropFileFindMany,
                    create: txDropFileCreate,
                },
                uploadChunk: { createMany: vi.fn() },
            }),
        );

        await expect(DropService.addFile(
            personalScope("owner-1"),
            {
                dropId: "form-drop",
                encryptedName: "encrypted",
                iv: "1234567890123456",
                size: 80, // 64 plaintext bytes; aggregate would be 118 > 100
                mimeType: "application/octet-stream",
                chunkCount: 1,
                chunkSize: 80,
            },
            {
                quotaOverride: {
                    maxFileSize: 100,
                    storageLimit: BigInt(10_000),
                    currentTier: "pro",
                },
            },
        )).rejects.toMatchObject({
            name: "UpgradeRequiredError",
            message: "Attachment size exceeds this form's file upload limit.",
        });

        expect(txDropFileFindMany).toHaveBeenCalled();
        expect(txExecuteRaw).not.toHaveBeenCalled();
        expect(txDropFileCreate).not.toHaveBeenCalled();
        expect(storage.abortMultipartUpload).toHaveBeenCalledWith("drop/file-2", "upload-2");
    });
});

describe("DropService.finishDrop", () => {
    const storedDrop = (uploadComplete = false) => ({
        id: "drop-123",
        userId: "user-123",
        organizationId: null,
        maxFileCount: 50,
        uploadComplete,
        deletedAt: null,
    });

    function installFinishTransaction({
        uploadComplete = false,
        storedFiles,
        storedChunks,
    }: {
        uploadComplete?: boolean;
        storedFiles: { id: string; chunkCount: number; uploadComplete: boolean }[];
        storedChunks: { fileId: string; chunkIndex: number; completed: boolean; etag: string | null }[];
    }) {
        const queryRaw = vi.fn().mockResolvedValue([storedDrop(uploadComplete)]);
        const fileFindMany = vi.fn().mockResolvedValue(storedFiles);
        const chunkFindMany = vi.fn().mockResolvedValue(storedChunks);
        const executeRaw = vi.fn().mockImplementation(async (_sql, json: string) => {
            const batch = JSON.parse(json) as { fileId: string; chunkIndex: number; etag: string }[];
            let updated = 0;
            for (const incoming of batch) {
                const chunk = storedChunks.find((candidate) =>
                    candidate.fileId === incoming.fileId && candidate.chunkIndex === incoming.chunkIndex
                );
                if (!chunk || (chunk.completed && chunk.etag !== incoming.etag)) continue;
                chunk.completed = true;
                chunk.etag = incoming.etag;
                updated += 1;
            }
            return updated;
        });
        const tx = {
            $queryRaw: queryRaw,
            $executeRaw: executeRaw,
            dropFile: { findMany: fileFindMany },
            uploadChunk: { findMany: chunkFindMany },
        };
        (prisma.$transaction as unknown as ReturnType<typeof vi.fn>).mockImplementation(
            async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
        );
        return { queryRaw, fileFindMany, chunkFindMany, executeRaw };
    }

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("rejects subset, extra, and duplicate file manifests before ETag writes", async () => {
        const harness = installFinishTransaction({
            storedFiles: [
                { id: "file-a", chunkCount: 1, uploadComplete: false },
                { id: "file-b", chunkCount: 1, uploadComplete: false },
            ],
            storedChunks: [],
        });
        const manifests = [
            [{ fileId: "file-a", chunks: [{ chunkIndex: 0, etag: "etag-a" }] }],
            [
                { fileId: "file-a", chunks: [{ chunkIndex: 0, etag: "etag-a" }] },
                { fileId: "file-b", chunks: [{ chunkIndex: 0, etag: "etag-b" }] },
                { fileId: "file-c", chunks: [{ chunkIndex: 0, etag: "etag-c" }] },
            ],
            [
                { fileId: "file-a", chunks: [{ chunkIndex: 0, etag: "etag-a" }] },
                { fileId: "file-a", chunks: [{ chunkIndex: 0, etag: "etag-a" }] },
            ],
        ];

        for (const manifest of manifests) {
            await expect(DropService.finishDrop("drop-123", manifest, personalScope("user-123")))
                .rejects.toThrow(/manifest|Duplicate/);
        }

        expect(harness.executeRaw).not.toHaveBeenCalled();
    });

    it("returns immediately when the drop already completed", async () => {
        const harness = installFinishTransaction({
            uploadComplete: true,
            storedFiles: [],
            storedChunks: [],
        });
        const completeFile = vi.spyOn(DropService, "completeFileUpload");
        const completeDrop = vi.spyOn(DropService, "completeDrop");

        await expect(DropService.finishDrop("drop-123", [], personalScope("user-123")))
            .resolves.toBeUndefined();

        expect(harness.fileFindMany).not.toHaveBeenCalled();
        expect(harness.executeRaw).not.toHaveBeenCalled();
        expect(completeFile).not.toHaveBeenCalled();
        expect(completeDrop).not.toHaveBeenCalled();
    });

    it("persists thousands of distinct ETags in bounded parameterized batches", async () => {
        const chunkCount = 1_001;
        const harness = installFinishTransaction({
            storedFiles: [{ id: "file-123", chunkCount, uploadComplete: false }],
            storedChunks: Array.from({ length: chunkCount }, (_, chunkIndex) => ({
                fileId: "file-123",
                chunkIndex,
                completed: false,
                etag: null,
            })),
        });
        const completeFile = vi.spyOn(DropService, "completeFileUpload").mockResolvedValue(undefined);
        const completeDrop = vi.spyOn(DropService, "completeDrop").mockResolvedValue(undefined);

        await DropService.finishDrop(
            "drop-123",
            [{
                fileId: "file-123",
                chunks: Array.from({ length: chunkCount }, (_, chunkIndex) => ({
                    chunkIndex,
                    etag: `etag-${chunkIndex}`,
                })),
            }],
            personalScope("user-123"),
        );

        expect(harness.executeRaw).toHaveBeenCalledTimes(3);
        expect(harness.executeRaw.mock.calls.map((call) => (JSON.parse(call[1] as string) as unknown[]).length))
            .toEqual([500, 500, 1]);
        const sql = (harness.executeRaw.mock.calls[0]?.[0] as TemplateStringsArray).join("?");
        expect(sql).toContain("jsonb_to_recordset");
        expect(sql).toContain('UPDATE "upload_chunks"');
        expect(sql).toContain('chunk."etag" = incoming."etag"');
        expect(completeFile).toHaveBeenCalledWith("file-123", personalScope("user-123"), true);
        expect(completeDrop).toHaveBeenCalledTimes(1);
    });

    it("accepts matching completed ETags and skips completed files on partial retry", async () => {
        const harness = installFinishTransaction({
            storedFiles: [
                { id: "file-complete", chunkCount: 1, uploadComplete: true },
                { id: "file-pending", chunkCount: 1, uploadComplete: false },
            ],
            storedChunks: [
                { fileId: "file-complete", chunkIndex: 0, completed: true, etag: "etag-complete" },
                { fileId: "file-pending", chunkIndex: 0, completed: true, etag: "etag-pending" },
            ],
        });
        const completeFile = vi.spyOn(DropService, "completeFileUpload").mockResolvedValue(undefined);
        const completeDrop = vi.spyOn(DropService, "completeDrop").mockResolvedValue(undefined);

        await DropService.finishDrop("drop-123", [
            { fileId: "file-complete", chunks: [{ chunkIndex: 0, etag: "etag-complete" }] },
            { fileId: "file-pending", chunks: [{ chunkIndex: 0, etag: "etag-pending" }] },
        ], personalScope("user-123"));

        expect(harness.executeRaw).not.toHaveBeenCalled();
        expect(completeFile).toHaveBeenCalledTimes(1);
        expect(completeFile).toHaveBeenCalledWith("file-pending", personalScope("user-123"), true);
        expect(completeDrop).toHaveBeenCalledTimes(1);
    });

    it("rejects an attempt to mutate a completed chunk ETag", async () => {
        const harness = installFinishTransaction({
            storedFiles: [{ id: "file-123", chunkCount: 1, uploadComplete: false }],
            storedChunks: [{
                fileId: "file-123",
                chunkIndex: 0,
                completed: true,
                etag: "original-etag",
            }],
        });

        await expect(DropService.finishDrop("drop-123", [{
            fileId: "file-123",
            chunks: [{ chunkIndex: 0, etag: "different-etag" }],
        }], personalScope("user-123"))).rejects.toThrow("Completed chunk ETag cannot be changed");

        expect(harness.executeRaw).not.toHaveBeenCalled();
    });
});

describe("DropService.completeDrop concurrency", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("locks the parent before checking files and marking the drop complete", async () => {
        const queryRaw = vi.fn().mockResolvedValue([{
            id: "drop-123",
            userId: "user-123",
            organizationId: null,
            maxFileCount: 50,
            uploadComplete: false,
            deletedAt: null,
        }]);
        const findMany = vi.fn().mockResolvedValue([
            { id: "file-123", uploadComplete: true },
        ]);
        const update = vi.fn().mockResolvedValue({ id: "drop-123" });
        (prisma.$transaction as unknown as ReturnType<typeof vi.fn>).mockImplementation(
            async (callback: (tx: unknown) => Promise<unknown>) => callback({
                $queryRaw: queryRaw,
                dropFile: { findMany },
                drop: { update },
            }),
        );

        await DropService.completeDrop("drop-123", personalScope("user-123"));

        const sql = (queryRaw.mock.calls[0]?.[0] as TemplateStringsArray).join("?");
        expect(sql).toContain('FROM "drops"');
        expect(sql).toContain("FOR UPDATE");
        expect(queryRaw.mock.invocationCallOrder[0]).toBeLessThan(findMany.mock.invocationCallOrder[0]!);
        expect(findMany.mock.invocationCallOrder[0]).toBeLessThan(update.mock.invocationCallOrder[0]!);
        expect(prisma.$transaction).toHaveBeenCalledWith(
            expect.any(Function),
            { isolationLevel: "ReadCommitted" },
        );
    });

    it("does not complete when the locked view includes a concurrent pending file", async () => {
        const update = vi.fn();
        (prisma.$transaction as unknown as ReturnType<typeof vi.fn>).mockImplementation(
            async (callback: (tx: unknown) => Promise<unknown>) => callback({
                $queryRaw: vi.fn().mockResolvedValue([{
                    id: "drop-123",
                    userId: "user-123",
                    organizationId: null,
                    maxFileCount: 50,
                    uploadComplete: false,
                    deletedAt: null,
                }]),
                dropFile: { findMany: vi.fn().mockResolvedValue([
                    { id: "complete-file", uploadComplete: true },
                    { id: "concurrent-file", uploadComplete: false },
                ]) },
                drop: { update },
            }),
        );

        await expect(DropService.completeDrop("drop-123", personalScope("user-123")))
            .rejects.toThrow("1 files not yet uploaded");
        expect(update).not.toHaveBeenCalled();
    });
});

describe("DropService.addFile guest reservations", () => {
    const guestDrop = {
        id: "guest-drop",
        userId: null,
        organizationId: null,
        deletedAt: null,
        uploadComplete: false,
        maxFileCount: 5,
        _count: { files: 0 },
    };

    const input = (size: number) => ({
        dropId: guestDrop.id,
        size,
        encryptedName: "encrypted-name",
        iv: "abcdefghijklmnop",
        mimeType: "application/octet-stream",
        chunkCount: 1,
        chunkSize: size,
    });

    function setUpConcurrentReservations(initialSizes: bigint[] = []) {
        const reservations = initialSizes.map((size, index) => ({ id: `existing-${index}`, size }));
        const queryRaw = vi.fn().mockResolvedValue([{ ...guestDrop, _count: undefined }]);
        const aggregate = vi.fn().mockImplementation(async () => ({
            _count: { _all: reservations.length },
            _sum: { size: reservations.reduce((sum, file) => sum + file.size, BigInt(0)) },
        }));
        const create = vi.fn().mockImplementation(async ({ data }) => {
            reservations.push({ id: data.id, size: data.size });
            return data;
        });
        const createMany = vi.fn().mockResolvedValue({ count: 1 });
        const tx = {
            $queryRaw: queryRaw,
            dropFile: { aggregate, create },
            uploadChunk: { createMany },
        };

        // Model PostgreSQL's parent-row lock: interactive transactions may be
        // started together, but only one reservation callback can hold the lock.
        let lockTail = Promise.resolve();
        (prisma.$transaction as unknown as ReturnType<typeof vi.fn>).mockImplementation(
            async (callback: (client: typeof tx) => Promise<unknown>) => {
                const previous = lockTail;
                let release: () => void = () => undefined;
                lockTail = new Promise<void>((resolve) => {
                    release = resolve;
                });
                await previous;
                try {
                    return await callback(tx);
                } finally {
                    release();
                }
            },
        );

        return { reservations, queryRaw, aggregate, create, createMany };
    }

    beforeEach(() => {
        vi.clearAllMocks();
        (prisma.drop.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(guestDrop);
        (prisma.dropFile.count as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(0);
        // This is deliberately stale for both concurrent callers; correctness
        // must come from the aggregate inside the locked transaction.
        (prisma.dropFile.aggregate as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            _sum: { size: BigInt(0) },
        });
        (storage.generateStorageKey as ReturnType<typeof vi.fn>).mockImplementation((fileId: string) => `drop/${fileId}`);
        (storage.initiateMultipartUpload as ReturnType<typeof vi.fn>).mockImplementation(
            async (storageKey: string) => `upload-${storageKey}`,
        );
        (storage.abortMultipartUpload as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    });

    it("serializes concurrent byte reservations so only one request can cross the guest cap", async () => {
        const harness = setUpConcurrentReservations();
        const fileSize = 60 * 1024 * 1024;

        const results = await Promise.allSettled([
            DropService.addFile(null, input(fileSize)),
            DropService.addFile(null, input(fileSize)),
        ]);

        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        const rejected = results.find((result) => result.status === "rejected");
        expect(rejected).toMatchObject({
            status: "rejected",
            reason: expect.objectContaining({
                name: "UpgradeRequiredError",
                message: "Guest drops are limited to 100MB total.",
            }),
        });
        expect(harness.reservations).toHaveLength(1);
        expect(harness.reservations[0]?.size).toBe(BigInt(fileSize));
        expect(harness.aggregate).toHaveBeenCalledTimes(2);
        expect(harness.create).toHaveBeenCalledTimes(1);
        expect(storage.abortMultipartUpload).toHaveBeenCalledTimes(1);
    });

    it("serializes concurrent file slots and uses a PostgreSQL row lock before aggregating", async () => {
        const harness = setUpConcurrentReservations([BigInt(17), BigInt(17), BigInt(17), BigInt(17)]);
        (prisma.drop.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            ...guestDrop,
            _count: { files: 4 },
        });
        (prisma.dropFile.aggregate as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            _sum: { size: BigInt(68) },
        });

        const results = await Promise.allSettled([
            DropService.addFile(null, input(17)),
            DropService.addFile(null, input(17)),
        ]);

        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        const rejected = results.find((result) => result.status === "rejected");
        expect(rejected).toMatchObject({
            status: "rejected",
            reason: expect.objectContaining({
                name: "ValidationError",
                message: "Drop already has maximum number of files (5)",
            }),
        });
        expect(harness.reservations).toHaveLength(5);
        expect(harness.create).toHaveBeenCalledTimes(1);
        expect(harness.createMany).toHaveBeenCalledTimes(1);

        expect(harness.queryRaw).toHaveBeenCalledTimes(2);
        const lockSql = (harness.queryRaw.mock.calls[0]?.[0] as TemplateStringsArray).join("?");
        expect(lockSql).toContain('FROM "drops"');
        expect(lockSql).toContain("FOR UPDATE");
        expect(harness.queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
            harness.aggregate.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
        );
        expect(prisma.$transaction).toHaveBeenCalledWith(
            expect.any(Function),
            { isolationLevel: "ReadCommitted" },
        );
        expect(storage.abortMultipartUpload).toHaveBeenCalledTimes(1);
    });

    it("keeps the hard guest file cap if a legacy row has no max-file setting", async () => {
        const harness = setUpConcurrentReservations([BigInt(17), BigInt(17), BigInt(17), BigInt(17), BigInt(17)]);
        const legacyDrop = { ...guestDrop, maxFileCount: null, _count: { files: 5 } };
        (prisma.drop.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(legacyDrop);
        harness.queryRaw.mockResolvedValue([{ ...legacyDrop, _count: undefined }]);
        (prisma.dropFile.aggregate as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            _sum: { size: BigInt(85) },
        });

        await expect(DropService.addFile(null, input(17))).rejects.toMatchObject({
            name: "ValidationError",
            message: "Drop already has maximum number of files (5)",
        });

        expect(harness.create).not.toHaveBeenCalled();
        expect(storage.abortMultipartUpload).toHaveBeenCalledTimes(1);
    });
});

describe("DropService.consumeDownload", () => {
    type TransactionClient = {
        $executeRaw: ReturnType<typeof vi.fn>;
    };
    type TransactionCallback = (tx: TransactionClient) => Promise<boolean>;

    function installTransaction(
        rowCounts: number[],
        committed: { drop: number; recipient: number },
    ): ReturnType<typeof vi.fn> {
        const executeRaw = vi.fn();

        (prisma.$transaction as unknown as ReturnType<typeof vi.fn>).mockImplementation(
            async (callback: TransactionCallback) => {
                const staged = { ...committed };
                let callIndex = 0;
                executeRaw.mockImplementation(async () => {
                    const rows = rowCounts[callIndex] ?? 0;
                    if (rows > 0) {
                        if (callIndex === 0) staged.drop += 1;
                        if (callIndex === 1) staged.recipient += 1;
                    }
                    callIndex += 1;
                    return rows;
                });

                try {
                    const result = await callback({ $executeRaw: executeRaw });
                    committed.drop = staged.drop;
                    committed.recipient = staged.recipient;
                    return result;
                } catch (error) {
                    // Simulate database rollback by intentionally not publishing
                    // staged state when the interactive callback throws.
                    throw error;
                }
            },
        );

        return executeRaw;
    }

    beforeEach(() => {
        vi.clearAllMocks();
        (prisma.$transaction as unknown as ReturnType<typeof vi.fn>).mockReset();
    });

    it("leaves the recipient allowance untouched when the global guard fails", async () => {
        const committed = { drop: 3, recipient: 1 };
        const executeRaw = installTransaction([0], committed);

        await expect(DropService.consumeDownload("drop-123", "recipient-123"))
            .resolves.toBe(false);

        expect(committed).toEqual({ drop: 3, recipient: 1 });
        expect(executeRaw).toHaveBeenCalledTimes(1);
        expect(prisma.drop.findUnique).not.toHaveBeenCalled();
    });

    it("rolls back the global count when the recipient guard fails", async () => {
        const committed = { drop: 2, recipient: 4 };
        const executeRaw = installTransaction([1, 0], committed);

        await expect(DropService.consumeDownload("drop-123", "recipient-123"))
            .resolves.toBe(false);

        expect(committed).toEqual({ drop: 2, recipient: 4 });
        expect(executeRaw).toHaveBeenCalledTimes(2);
        expect(prisma.drop.findUnique).not.toHaveBeenCalled();

        const dropSql = (executeRaw.mock.calls[0]?.[0] as TemplateStringsArray).join("?");
        expect(dropSql).toContain('"disabled" = FALSE');
        expect(dropSql).toContain('"takenDown" = FALSE');
        expect(dropSql).toContain('"uploadComplete" = TRUE');
        expect(dropSql).toContain('"form_staging_id" IS NULL');
        expect(dropSql).toContain('FROM "upload_tokens"');
        expect(dropSql).toContain('token."formId" IS NOT NULL');
        expect(dropSql).toContain('"restrictToRecipients" = FALSE');
        expect(dropSql).toContain('"expiresAt" > NOW()');

        const recipientSql = (executeRaw.mock.calls[1]?.[0] as TemplateStringsArray).join("?");
        expect(recipientSql).toContain('"dropId" =');
        expect(recipientSql).toContain('"revokedAt" IS NULL');
        expect(recipientSql).toContain('"expiresAt" > NOW()');
        expect(recipientSql).toContain('"downloads" < "maxDownloads"');
    });

    it("commits global and recipient counts together", async () => {
        const committed = { drop: 0, recipient: 0 };
        installTransaction([1, 1], committed);
        (prisma.drop.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

        await expect(DropService.consumeDownload("drop-123", "recipient-123"))
            .resolves.toBe(true);

        expect(committed).toEqual({ drop: 1, recipient: 1 });
    });
});
