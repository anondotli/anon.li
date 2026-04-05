/**
 * Tests for Drop Service
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import { DropService } from "@/lib/services/drop";
import { prisma } from "@/lib/prisma";
import * as storage from "@/lib/storage";

// Mock dependencies
vi.mock("@/lib/prisma", () => ({
    prisma: {
        $executeRaw: vi.fn().mockResolvedValue(1),
        dropFile: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
        user: {
            update: vi.fn(),
        },
        dropSession: {
            findFirst: vi.fn(),
        },
        drop: {
            update: vi.fn(),
        },
        orphanedFile: {
            create: vi.fn(),
        },
    },
}));

vi.mock("@/lib/storage", () => ({
    completeMultipartUpload: vi.fn(),
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

 

describe("DropService.completeFileUpload", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should complete upload if size matches", async () => {
        const fileId = "file-123";
        const userId = "user-123";
        const size = BigInt(1024);

        // Mock file retrieval
        (prisma.dropFile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: fileId,
            size,
            storageKey: "d/fi/file-123",
            s3UploadId: "upload-123",
            chunks: [
                { chunkIndex: 0, etag: "etag-1", completed: true },
            ],
            drop: { userId, id: "drop-123" },
        });

        // Mock storage metadata
        (storage.getObjectMetadata as ReturnType<typeof vi.fn>).mockResolvedValue({
            contentLength: 1024,
            contentType: "application/octet-stream",
        });

        await DropService.completeFileUpload(fileId, userId);

        expect(storage.completeMultipartUpload).toHaveBeenCalled();
        expect(storage.getObjectMetadata).toHaveBeenCalled();
        expect(prisma.dropFile.update).toHaveBeenCalledWith({
            where: { id: fileId },
            data: { uploadComplete: true, size: BigInt(1024) },
        });
    });

    it("should throw error and delete object if uploaded size exceeds declared size", async () => {
        const fileId = "file-oversized";
        const userId = "user-123";
        const declaredSize = BigInt(1024);
        const actualSize = 2048; // 2x declared

        // Mock file retrieval
        (prisma.dropFile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: fileId,
            size: declaredSize,
            storageKey: "d/fi/file-oversized",
            s3UploadId: "upload-123",
            chunks: [
                { chunkIndex: 0, etag: "etag-1", completed: true },
            ],
            drop: { userId, id: "drop-123" },
        });

        // Mock storage metadata
        (storage.getObjectMetadata as ReturnType<typeof vi.fn>).mockResolvedValue({
            contentLength: actualSize,
            contentType: "application/octet-stream",
        });

        await expect(DropService.completeFileUpload(fileId, userId))
            .rejects.toThrow("File size mismatch");

        expect(storage.completeMultipartUpload).toHaveBeenCalled();
        expect(storage.getObjectMetadata).toHaveBeenCalled();
        expect(storage.deleteObject).toHaveBeenCalledWith("d/fi/file-oversized");
        expect(prisma.dropFile.update).not.toHaveBeenCalled();
    });
});
