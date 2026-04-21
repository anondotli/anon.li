/**
 * Drop Service for anon.li Drop
 *
 * Handles all drop-related operations:
 * - Creating drops (collections)
 * - Adding files to drops
 * - Managing multipart uploads
 * - Download tracking
 *
 * Cleanup operations are in drop-cleanup.ts (used by cron).
 */

import { prisma } from "@/lib/prisma";
import { customAlphabet } from "nanoid";
import { createLogger } from "@/lib/logger";
import {
    calculateExpiry,
    getUserAndLimits,
    validateFileSize,
    validateInputLengths,
    enforceFeatureFlags,
} from "@/lib/drop-utils";
import {
    generateStorageKey,
    initiateMultipartUpload,
    completeMultipartUpload,
    abortMultipartUpload,
    deleteObject,
    deleteObjects,
    getObjectMetadata,
} from "@/lib/storage";
import type { Drop, DropFile, UploadChunk } from "@prisma/client";
import { ValidationError, NotFoundError, ForbiddenError, RateLimitError, UpgradeRequiredError } from "@/lib/api-error-utils";
import { decrementStorageUsed } from "@/lib/services/drop-storage";
import { revokeUploadTokens } from "@/lib/services/drop-upload-token";
import {
    DROP_FEATURES,
    GUEST_MAX_DROP_BYTES,
    GUEST_MAX_FILES_PER_DROP,
    PLAN_ENTITLEMENTS,
} from "@/config/plans";

// ID generator: lowercase alphanumeric, 16 chars = ~83 bits of entropy
const generateDropId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 16);
const generateFileId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 10);

const logger = createLogger("DropService");

// Type for file with drop relation
type DropFileWithDropAndChunks = DropFile & { drop: { userId: string | null; id: string }; chunks: UploadChunk[] };

// Type for drop with files relation
type DropWithFilesRelation = Drop & { files: { id: string; encryptedName: string; size: bigint; mimeType: string; iv: string }[] };

interface CreateDropInput {
    iv: string;
    encryptedTitle?: string;
    encryptedMessage?: string;
    expiry?: number;
    maxDownloads?: number;
    customKey?: boolean;
    salt?: string;
    customKeyData?: string;
    customKeyIv?: string;
    hideBranding?: boolean;
    notifyOnDownload?: boolean;
    fileCount?: number;
}

interface CreateDropResult {
    dropId: string;
    expiresAt: Date | null;
}

interface AddFileInput {
    dropId: string;
    size: number;
    encryptedName: string;
    iv: string;
    mimeType: string;
    chunkCount: number;
    chunkSize: number;
}

interface AddFileResult {
    fileId: string;
    s3UploadId: string;
    storageKey: string;
}

interface DropWithFiles {
    id: string;
    encryptedTitle: string | null;
    encryptedMessage: string | null;
    iv: string;
    customKey: boolean;
    salt: string | null;
    customKeyData: string | null;
    customKeyIv: string | null;
    downloads: number;
    maxDownloads: number | null;
    expiresAt: Date | null;
    hideBranding: boolean;
    uploadComplete: boolean;
    createdAt: Date;
    files: {
        id: string;
        encryptedName: string;
        size: string;
        mimeType: string;
        iv: string;
        chunkSize: number | null;
        chunkCount: number | null;
    }[];
}

export interface DropListItem {
    id: string;
    encryptedTitle: string | null;
    iv: string;
    downloads: number;
    maxDownloads: number | null;
    expiresAt: Date | null;
    customKey: boolean;
    hideBranding: boolean;
    disabled: boolean;
    takenDown: boolean;
    takedownReason: string | null;
    uploadComplete: boolean;
    createdAt: Date;
    files: {
        id: string;
        encryptedName: string;
        size: string;
        mimeType: string;
        iv: string;
    }[];
    fileCount: number;
    totalSize: string;
}

export class DropService {
    /**
     * Verify that the caller owns the drop (authenticated user match).
     */
    private static verifyDropOwnership(
        drop: { userId: string | null; id: string },
        userId: string
    ): void {
        if (!drop.userId || drop.userId !== userId) {
            throw new ForbiddenError("Unauthorized");
        }
    }

    /**
     * Verify access for either an authenticated user or a guest (token-bound).
     * Route layer has already verified the upload token before calling this;
     * here we only assert that the drop and caller mode agree.
     */
    private static verifyDropAccess(
        drop: { userId: string | null; id: string },
        userId: string | null
    ): void {
        if (userId) {
            if (drop.userId !== userId) throw new ForbiddenError("Unauthorized");
            return;
        }
        if (drop.userId !== null) throw new ForbiddenError("Unauthorized");
    }

    /**
     * Delete files from storage and reclaim quota for the owning user.
     * Only decrements quota for files that were actually deleted from storage.
     * Records failed deletions as orphaned files for later retry.
     */
    private static async deleteFilesAndReclaimQuota(
        files: { id: string; storageKey: string; size: bigint }[],
        userId: string
    ): Promise<void> {
        if (files.length === 0) return;

        const keys = files.map(f => f.storageKey);
        let failedKeys: string[];
        try {
            failedKeys = await deleteObjects(keys);
        } catch (e) {
            logger.error("Batch delete failed, falling back to per-file deletion", e);
            failedKeys = [];
            for (const file of files) {
                try {
                    await deleteObject(file.storageKey);
                } catch (fileErr) {
                    logger.error(`Failed to delete file from storage`, fileErr, { fileId: file.id });
                    failedKeys.push(file.storageKey);
                }
            }
        }

        // Record failed keys as orphaned files for cron retry
        const failedKeySet = new Set(failedKeys);
        if (failedKeySet.size > 0) {
            for (const key of failedKeySet) {
                try {
                    await prisma.orphanedFile.create({ data: { storageKey: key } });
                } catch (e) {
                    logger.error("Failed to record orphaned file", e, { storageKey: key });
                }
            }
        }

        // Reclaim quota for successfully deleted files
        const reclaimSize = files
            .filter(f => !failedKeySet.has(f.storageKey))
            .reduce((sum, f) => sum + f.size, BigInt(0));
        if (reclaimSize > BigInt(0)) {
            await decrementStorageUsed(userId, reclaimSize);
        }
    }

    /**
     * Create a new drop (collection for grouping files).
     * When userId is null the caller is a guest: a hardcoded guest limits
     * profile is applied (100MB per file, 1-day expiry, fileCount cap), and
     * no vault-backed owner key is persisted.
     */
    static async createDrop(
        userId: string | null,
        input: CreateDropInput
    ): Promise<CreateDropResult> {
        if (!/^[A-Za-z0-9_-]{16}$/.test(input.iv)) {
            throw new ValidationError("Invalid IV format");
        }

        validateInputLengths(input);

        if (input.customKey && !input.salt) {
            throw new ValidationError("Custom key drops must provide a salt");
        }

        let effectiveTier: "guest" | "free" | "plus" | "pro";
        let maxExpiry: number;
        let featureLimits: (typeof DROP_FEATURES)[keyof typeof DROP_FEATURES];
        let maxFileCount: number | null;

        if (userId) {
            const { limits, tier } = await getUserAndLimits(userId);
            effectiveTier = tier;
            maxExpiry = limits.maxExpiry;
            featureLimits = limits.features;
            maxFileCount = input.fileCount ?? null;
        } else {
            effectiveTier = "guest";
            maxExpiry = PLAN_ENTITLEMENTS.drop.guest.maxExpiryDays;
            featureLimits = DROP_FEATURES.guest;
            const requested = input.fileCount ?? GUEST_MAX_FILES_PER_DROP;
            if (requested > GUEST_MAX_FILES_PER_DROP) {
                throw new ValidationError(
                    `Guest drops support at most ${GUEST_MAX_FILES_PER_DROP} files.`,
                );
            }
            maxFileCount = Math.min(requested, GUEST_MAX_FILES_PER_DROP);
        }

        const features = enforceFeatureFlags(
            {
                hideBranding: input.hideBranding,
                notifyOnDownload: input.notifyOnDownload,
                customKey: input.customKey,
            },
            featureLimits
        );

        const expiresAt = calculateExpiry(input.expiry, maxExpiry, effectiveTier);
        const dropId = generateDropId();

        await prisma.drop.create({
            data: {
                id: dropId,
                iv: input.iv,
                encryptedTitle: input.encryptedTitle || null,
                encryptedMessage: input.encryptedMessage || null,
                expiresAt,
                maxDownloads: input.maxDownloads || null,
                maxFileCount,
                customKey: features.customKey,
                salt: features.customKey ? input.salt : null,
                customKeyData: features.customKey ? input.customKeyData : null,
                customKeyIv: features.customKey ? input.customKeyIv : null,
                hideBranding: features.hideBranding,
                notifyOnDownload: features.notifyOnDownload,
                uploadComplete: false,
                userId: userId,
            },
        });

        return {
            dropId,
            expiresAt,
        };
    }

    /**
     * Add a file to an existing drop.
     * Accepts null userId for guest drops; in that case guest-tier size caps
     * apply and there is no persistent user.storageUsed reservation.
     */
    static async addFile(
        userId: string | null,
        input: AddFileInput
    ): Promise<AddFileResult> {
        // Validate IV format (must be exactly 16 base64url characters)
        if (!/^[A-Za-z0-9_-]{16}$/.test(input.iv)) {
            throw new ValidationError("Invalid IV format: must be 16 characters base64url");
        }

        // Get the drop and verify access
        const drop = await prisma.drop.findUnique({
            where: { id: input.dropId },
            include: { _count: { select: { files: true } } },
        });

        if (!drop) {
            throw new NotFoundError("Drop not found");
        }

        if (drop.deletedAt) {
            throw new NotFoundError("Drop has been deleted");
        }

        if (drop.uploadComplete) {
            throw new ValidationError("Drop upload already completed");
        }

        // Enforce file count limit
        if (drop.maxFileCount !== null && drop._count.files >= drop.maxFileCount) {
            throw new ValidationError(`Drop already has maximum number of files (${drop.maxFileCount})`);
        }

        // Resource exhaustion limits
        const MAX_PENDING_FILES_PER_DROP = 50;
        const MAX_INCOMPLETE_DROPS_PER_USER = 10;

        // Count pending files for this drop
        const pendingFiles = await prisma.dropFile.count({
            where: { dropId: input.dropId, uploadComplete: false }
        });
        if (pendingFiles >= MAX_PENDING_FILES_PER_DROP) {
            throw new RateLimitError("Too many pending uploads for this drop");
        }

        // Per-user incomplete-drop guard only applies to authenticated drops;
        // guests are guarded by IP rate limits at the route layer.
        if (userId) {
            const incompleteDrops = await prisma.drop.count({
                where: { userId, uploadComplete: false, deletedAt: null }
            });
            if (incompleteDrops >= MAX_INCOMPLETE_DROPS_PER_USER) {
                throw new RateLimitError("Too many incomplete drops. Please complete or delete existing drops.");
            }
        }

        // Verify caller mode matches drop ownership
        DropService.verifyDropAccess(drop, userId);

        if (userId) {
            // Authenticated path: validate against per-user plan limits and
            // reserve storage atomically to prevent TOCTOU.
            const { limits, storageUsed, tier } = await getUserAndLimits(userId);

            validateFileSize(input.size, storageUsed, BigInt(limits.maxStorage), limits.maxFileSize, tier);

            const storageLimit = BigInt(limits.maxStorage);
            const reserved = await prisma.$executeRaw`
                UPDATE "users"
                SET "storageUsed" = "storageUsed" + ${BigInt(input.size)}
                WHERE "id" = ${userId}
                  AND "storageUsed" + ${BigInt(input.size)} <= ${storageLimit}
            `;
            if (reserved === 0) {
                throw new UpgradeRequiredError(
                    "Bandwidth limit reached. Upgrade for more headroom.",
                    {
                        scope: "drop_bandwidth",
                        currentTier: tier,
                        suggestedTier: tier === "pro" ? "pro" : tier === "plus" ? "pro" : "plus",
                        currentValue: Number(storageUsed + BigInt(input.size)),
                        limitValue: Number(storageLimit),
                    }
                );
            }
        } else {
            // Guest path: enforce per-file and per-drop caps inline. No user
            // storageUsed reservation because there is no user row.
            if (input.size > GUEST_MAX_DROP_BYTES) {
                throw new UpgradeRequiredError(
                    `File size exceeds guest limit of ${GUEST_MAX_DROP_BYTES / (1024 * 1024)}MB. Sign up for a larger quota.`,
                    {
                        scope: "drop_file_size",
                        currentTier: "guest",
                        suggestedTier: "plus",
                        currentValue: input.size,
                        limitValue: GUEST_MAX_DROP_BYTES,
                    }
                );
            }

            const existing = await prisma.dropFile.aggregate({
                where: { dropId: input.dropId },
                _sum: { size: true },
            });
            const existingBytes = existing._sum.size ?? BigInt(0);
            if (existingBytes + BigInt(input.size) > BigInt(GUEST_MAX_DROP_BYTES)) {
                throw new UpgradeRequiredError(
                    "Guest drops are limited to 100MB total.",
                    {
                        scope: "drop_bandwidth",
                        currentTier: "guest",
                        suggestedTier: "plus",
                        currentValue: Number(existingBytes + BigInt(input.size)),
                        limitValue: GUEST_MAX_DROP_BYTES,
                    }
                );
            }
        }

        // Create file record and initiate upload.
        // Quota has already been reserved atomically above. If any of the
        // following steps fail we must compensate (release quota, abort B2
        // multipart, delete the orphan DropFile row) so quota doesn't leak.
        const fileId = generateFileId();
        const storageKey = generateStorageKey(fileId);

        let s3UploadId: string | null = null;
        let fileCreated = false;
        try {
            s3UploadId = await initiateMultipartUpload(storageKey, "application/octet-stream");

            await prisma.dropFile.create({
                data: {
                    id: fileId,
                    dropId: input.dropId,
                    storageKey,
                    s3UploadId,
                    encryptedName: input.encryptedName,
                    iv: input.iv,
                    size: BigInt(input.size),
                    mimeType: input.mimeType,
                    chunkCount: input.chunkCount,
                    chunkSize: input.chunkSize,
                    uploadComplete: false,
                },
            });
            fileCreated = true;

            // Create chunk tracking records
            const partNumbers = Array.from({ length: input.chunkCount }, (_, i) => i + 1);
            await prisma.uploadChunk.createMany({
                data: partNumbers.map((partNumber) => ({
                    fileId,
                    chunkIndex: partNumber - 1,
                    size: BigInt(input.chunkSize),
                    completed: false,
                })),
            });
        } catch (err) {
            logger.error("addFile setup failed, compensating", err, { dropId: input.dropId, fileId });
            // Compensate in reverse order — best-effort, never throw from here.
            if (fileCreated) {
                await prisma.dropFile.delete({ where: { id: fileId } }).catch((e) =>
                    logger.error("Compensation: failed to delete DropFile row", e, { fileId })
                );
            }
            if (s3UploadId) {
                await abortMultipartUpload(storageKey, s3UploadId).catch((e) =>
                    logger.error("Compensation: failed to abort multipart upload", e, { fileId, storageKey })
                );
            }
            if (userId) {
                await decrementStorageUsed(userId, BigInt(input.size)).catch((e) =>
                    logger.error("Compensation: failed to release reserved quota", e, { userId, size: input.size })
                );
            }
            throw err;
        }

        return {
            fileId,
            s3UploadId,
            storageKey,
        };
    }

    /**
     * Complete a file upload (finalize multipart upload).
     * When skipAuth is true, ownership verification is skipped (used by finishDrop
     * which already verified ownership up front).
     */
    static async completeFileUpload(
        fileId: string,
        userId: string | null,
        skipAuth = false
    ): Promise<void> {
        const file = await prisma.dropFile.findUnique({
            where: { id: fileId },
            include: {
                drop: { select: { userId: true, id: true } },
                chunks: { orderBy: { chunkIndex: "asc" } },
            },
        }) as DropFileWithDropAndChunks | null;

        if (!file) {
            throw new NotFoundError("File not found");
        }

        if (!skipAuth) {
            DropService.verifyDropAccess(file.drop, userId);
        }

        // Verify all chunks uploaded
        const incompleteChunks = file.chunks.filter((c: UploadChunk) => !c.completed);
        if (incompleteChunks.length > 0) {
            throw new ValidationError(`${incompleteChunks.length} chunks not yet uploaded`);
        }

        // Complete multipart upload
        const parts = file.chunks.map((chunk: UploadChunk) => ({
            PartNumber: chunk.chunkIndex + 1,
            ETag: chunk.etag!,
        }));

        try {
            await completeMultipartUpload(file.storageKey, file.s3UploadId!, parts);

            // SECURITY: Verify actual file size to prevent quota bypass
            const metadata = await getObjectMetadata(file.storageKey);
            if (metadata) {
                const actualSize = BigInt(metadata.contentLength);
                if (actualSize > file.size) {
                    // User uploaded more than declared - potential quota bypass
                    if (userId) {
                        // Release the reserved quota
                        await decrementStorageUsed(userId, file.size);
                    }
                    await deleteObject(file.storageKey);
                    throw new ValidationError("File size mismatch: uploaded more than declared");
                }
                // Also reject if significantly undersize (< 90% of declared)
                // This prevents reserving quota with a large declared size but uploading tiny files
                const minExpectedSize = file.size * BigInt(9) / BigInt(10);
                if (actualSize < minExpectedSize && file.size > BigInt(1024)) {
                    if (userId) {
                        await decrementStorageUsed(userId, file.size);
                    }
                    await deleteObject(file.storageKey);
                    throw new ValidationError("File size mismatch: uploaded significantly less than declared");
                }

                // Update file record with actual size
                await prisma.dropFile.update({
                    where: { id: fileId },
                    data: { uploadComplete: true, size: actualSize },
                });

                // Adjust storage: quota was reserved at declared size in addFile(),
                // correct for the difference between declared and actual
                if (userId && actualSize < file.size) {
                    const difference = file.size - actualSize;
                    await decrementStorageUsed(userId, difference);
                }
            } else {
                // Metadata unavailable — declared size already reserved, just mark complete
                await prisma.dropFile.update({
                    where: { id: fileId },
                    data: { uploadComplete: true },
                });
            }
        } catch (error) {
            // If this is a ValidationError we threw above (size mismatch), quota was already
            // handled inside the block — just re-throw.
            if (error instanceof ValidationError) {
                throw error;
            }

            // S3 completeMultipartUpload or metadata check failed — clean up to prevent quota leak
            logger.error("completeFileUpload failed, cleaning up", error, { fileId, storageKey: file.storageKey });

            // Best-effort: abort the multipart upload
            try {
                await abortMultipartUpload(file.storageKey, file.s3UploadId!);
            } catch {
                // Swallow — upload may already be completed or absent
            }

            // Best-effort: delete the object in case completion partially succeeded
            try {
                await deleteObject(file.storageKey);
            } catch (deleteErr) {
                logger.error("Failed to delete object, recording for cron retry", deleteErr, { fileId, storageKey: file.storageKey });
                try {
                    await prisma.orphanedFile.create({ data: { storageKey: file.storageKey } });
                } catch (orphanErr) {
                    logger.error("Failed to record orphaned file", orphanErr, { fileId, storageKey: file.storageKey });
                }
            }

            // Reclaim the quota reserved in addFile()
            if (userId) {
                try {
                    await decrementStorageUsed(userId, file.size);
                } catch (quotaErr) {
                    logger.error("Failed to decrement storageUsed during cleanup", quotaErr, { fileId, userId });
                }
            }

            throw error;
        }
    }

    /**
     * Complete a drop (mark all files as uploaded).
     * When skipAuth is true, ownership verification is skipped (used by finishDrop
     * which already verified ownership up front).
     */
    static async completeDrop(
        dropId: string,
        userId: string | null,
        skipAuth = false
    ): Promise<void> {
        const drop = await prisma.drop.findUnique({
            where: { id: dropId },
            include: {
                files: { select: { id: true, uploadComplete: true } },
            },
        });

        if (!drop) {
            throw new NotFoundError("Drop not found");
        }

        if (drop.deletedAt) {
            throw new NotFoundError("Drop has been deleted");
        }

        if (!skipAuth) {
            DropService.verifyDropAccess(drop, userId);
        }

        // Check all files are uploaded
        const incompleteFiles = drop.files.filter((f) => !f.uploadComplete);
        if (incompleteFiles.length > 0) {
            throw new ValidationError(`${incompleteFiles.length} files not yet uploaded`);
        }

        if (drop.files.length === 0) {
            throw new ValidationError("Drop has no files");
        }

        await prisma.drop.update({
            where: { id: dropId },
            data: { uploadComplete: true },
        });
    }

    /**
     * Batch finalize a drop: record all chunks, complete all files, complete the drop.
     * Reusable by server actions and API routes.
     * Verifies ownership once up front, then skips auth in the per-file/per-drop calls.
     */
    static async finishDrop(
        dropId: string,
        files: { fileId: string; chunks: { chunkIndex: number; etag: string }[] }[],
        userId: string | null
    ): Promise<void> {
        // Verify ownership once for the whole operation and verify every file
        // belongs to this drop before writing any chunk state.
        const drop = await prisma.drop.findUnique({
            where: { id: dropId },
            include: { files: { select: { id: true } } },
        });
        if (!drop) throw new NotFoundError("Drop not found");
        DropService.verifyDropAccess(drop, userId);

        const dropFileIds = new Set(drop.files.map((file) => file.id));
        const requestedFileIds = new Set<string>();
        for (const file of files) {
            if (requestedFileIds.has(file.fileId)) {
                throw new ValidationError("Duplicate file in finish request");
            }
            requestedFileIds.add(file.fileId);
            if (!dropFileIds.has(file.fileId)) {
                throw new NotFoundError("File not found");
            }
        }

        // Mark all chunks as completed with their etags in a single
        // transaction. Previously this was a nested serial loop (one DB
        // round-trip per chunk); batching cuts finalization latency from
        // O(chunks) round-trips to a single transaction regardless of file
        // count. We still need per-row updates because each chunk has a
        // distinct etag — Prisma doesn't support SQL CASE/VALUES natively,
        // so $transaction with an array of updates is the pragmatic form.
        const chunkUpdates = files.flatMap((file) =>
            file.chunks.map((chunk) =>
                prisma.uploadChunk.update({
                    where: {
                        fileId_chunkIndex: {
                            fileId: file.fileId,
                            chunkIndex: chunk.chunkIndex,
                        },
                    },
                    data: {
                        completed: true,
                        etag: chunk.etag,
                    },
                })
            )
        );
        if (chunkUpdates.length > 0) {
            await prisma.$transaction(chunkUpdates);
        }

        await Promise.all(files.map(async (file) => {
            await this.completeFileUpload(file.fileId, userId, true);
        }));
        await this.completeDrop(dropId, userId, true);

        // Guest drops: once the drop is marked complete, retire any upload
        // tokens so the raw token cannot be replayed to modify the drop.
        if (userId === null) {
            await revokeUploadTokens(dropId).catch((err) =>
                logger.error("Failed to revoke guest upload tokens after finish", err, { dropId }),
            );
        }
    }

    /**
     * Get a drop with all its files for download
     */
    static async getDropWithFiles(dropId: string): Promise<DropWithFiles | null> {
        const drop = await prisma.drop.findUnique({
            where: { id: dropId },
            include: {
                files: {
                    where: { uploadComplete: true },
                    select: {
                        id: true,
                        encryptedName: true,
                        size: true,
                        mimeType: true,
                        iv: true,
                        storageKey: true,
                        chunkSize: true,
                        chunkCount: true,
                    },
                },
            },
        });

        if (!drop || drop.deletedAt) {
            return null;
        }

        if (drop.takenDown) {
            throw new ForbiddenError("This drop has been removed due to a policy violation.");
        }

        if (drop.disabled) {
            throw new ForbiddenError("This link has been disabled by the owner.");
        }

        if (!drop.uploadComplete) {
            throw new ForbiddenError("This drop is not yet available.");
        }

        // Check download limit
        if (drop.maxDownloads && drop.downloads >= drop.maxDownloads) {
            throw new ForbiddenError("Download limit reached.");
        }

        if (drop.expiresAt && new Date() > drop.expiresAt) {
            throw new ForbiddenError("This drop has expired.");
        }

        const filesWithMetadata = drop.files.map((f) => ({
            id: f.id,
            encryptedName: f.encryptedName,
            size: f.size.toString(),
            mimeType: f.mimeType,
            iv: f.iv,
            chunkSize: f.chunkSize,
            chunkCount: f.chunkCount,
        }));

        return {
            id: drop.id,
            encryptedTitle: drop.encryptedTitle,
            encryptedMessage: drop.encryptedMessage,
            iv: drop.iv,
            customKey: drop.customKey,
            salt: drop.salt,
            customKeyData: drop.customKeyData,
            customKeyIv: drop.customKeyIv,
            downloads: drop.downloads,
            maxDownloads: drop.maxDownloads,
            expiresAt: drop.expiresAt,
            hideBranding: drop.hideBranding,
            uploadComplete: drop.uploadComplete,
            createdAt: drop.createdAt,
            files: filesWithMetadata,
        };
    }

    /**
     * Increment download count and handle limits/notifications.
     * Uses atomic raw SQL to prevent TOCTOU race conditions with maxDownloads:
     * the WHERE clause ensures the increment only happens when under the limit.
     * Returns false if the download limit was already reached.
     */
    static async incrementDownloadCount(dropId: string): Promise<boolean> {
        // Atomic increment with guard: only increments when maxDownloads is not reached.
        // Prisma updateMany cannot compare two columns in the same row, so raw SQL is required.
        const rowsAffected = await prisma.$executeRaw`
            UPDATE "drops"
            SET "downloads" = "downloads" + 1, "viewedAt" = NOW()
            WHERE "id" = ${dropId}
              AND "deletedAt" IS NULL
              AND ("maxDownloads" IS NULL OR "downloads" < "maxDownloads")
        `;

        if (rowsAffected === 0) {
            return false;
        }

        // Fetch fresh drop data for notifications and limit check
        const drop = await prisma.drop.findUnique({
            where: { id: dropId },
            include: {
                user: { select: { id: true, email: true, name: true } },
                files: { select: { id: true, storageKey: true, size: true } },
            },
        });

        if (!drop) return true;

        // Send notification if enabled and not already sent for this download
        if (
            drop.notifyOnDownload &&
            drop.user?.email &&
            drop.notificationsSent < drop.downloads
        ) {
            try {
                const { sendEmail } = await import("@/lib/resend");
                const { FileDownloadedEmail } = await import(
                    "@/components/email/file-downloaded"
                );

                await sendEmail({
                    to: drop.user.email,
                    subject: "Your drop was accessed",
                    react: FileDownloadedEmail({
                        fileName: "Your shared files",
                        downloadCount: drop.downloads,
                        downloadTime: new Date().toLocaleString(),
                    }),
                });

                await prisma.drop.update({
                    where: { id: dropId },
                    data: { notificationsSent: { increment: 1 } },
                });
            } catch (error) {
                logger.error("Failed to send download notification", error);
            }
        }

        // Check if download limit has been reached - soft-delete only.
        // Storage objects must remain available for the presigned URLs we are
        // about to hand back to the caller; the cron cleanup pass
        // (cleanupSoftDeletedDrops) performs the actual object deletion and
        // quota reclamation after a short grace period.
        if (drop.maxDownloads && drop.downloads >= drop.maxDownloads) {
            await this.markDropLimitReached(drop);
        }

        return true;
    }

    /**
     * Mark a drop as soft-deleted when its download limit is reached.
     * Does NOT delete storage objects — those must survive long enough for the
     * in-flight caller's presigned URLs to be used. The soft-deleted drop is
     * picked up by cleanupSoftDeletedDrops on the next cron tick (hourly) with
     * a shortened grace window for auto-deleted drops.
     */
    private static async markDropLimitReached(drop: {
        id: string;
        userId: string | null;
        user: { id: string; email: string | null; name: string | null } | null;
        downloads: number;
    }): Promise<void> {
        try {
            // Guarded soft-delete: only set deletedAt if it's still null. This
            // prevents resetting the grace clock if a concurrent download also
            // reached the limit.
            await prisma.$executeRaw`
                UPDATE "drops"
                SET "deletedAt" = NOW()
                WHERE "id" = ${drop.id}
                  AND "deletedAt" IS NULL
            `;

            if (drop.user?.email) {
                try {
                    const { sendDownloadLimitReachedEmail } = await import("@/lib/resend");
                    await sendDownloadLimitReachedEmail(
                        drop.user.email,
                        "Your shared files",
                        drop.id,
                        drop.downloads
                    );
                } catch (e) {
                    logger.error("Failed to send download limit notification", e);
                }
            }

            logger.info(`Soft-deleted drop - download limit reached`, { dropId: drop.id, downloads: drop.downloads });
        } catch (error) {
            logger.error(`Failed to soft-delete drop after limit reached`, error, { dropId: drop.id });
            // Don't throw - the download was still successful, cron cleanup will retry.
        }
    }

    /**
     * Toggle drop disabled state (revoke/restore access)
     */
    static async toggleDrop(dropId: string, userId: string): Promise<boolean> {
        const drop = await prisma.drop.findUnique({
            where: { id: dropId },
        });

        if (!drop) {
            throw new NotFoundError("Drop not found");
        }

        if (drop.userId !== userId) {
            throw new ForbiddenError("Unauthorized");
        }

        const newState = !drop.disabled;

        await prisma.drop.update({
            where: { id: dropId },
            data: {
                disabled: newState,
                disabledAt: newState ? new Date() : null,
            },
        });

        return newState;
    }

    /**
     * Delete a drop and all its files
     */
    static async deleteDrop(dropId: string, userId: string): Promise<void> {
        const drop = await prisma.drop.findUnique({
            where: { id: dropId },
            include: {
                files: { select: { id: true, storageKey: true, size: true } },
            },
        });

        if (!drop) {
            throw new NotFoundError("Drop not found");
        }

        if (drop.userId !== userId) {
            throw new ForbiddenError("Unauthorized");
        }

        await DropService.deleteFilesAndReclaimQuota(drop.files, userId);

        await prisma.drop.delete({ where: { id: dropId } });
    }

    /**
     * List drops for a user
     */
    static async listDrops(
        userId: string,
        options: { limit?: number; offset?: number } = {}
    ): Promise<{ drops: DropListItem[]; total: number }> {
        const { limit = 50, offset = 0 } = options;

        const drops = await prisma.drop.findMany({
            where: {
                userId,
                deletedAt: null,
            },
            include: {
                files: {
                    select: {
                        id: true,
                        encryptedName: true,
                        size: true,
                        mimeType: true,
                        iv: true,
                    },
                },
            },
            orderBy: { createdAt: "desc" },
            take: limit,
            skip: offset,
        });

        const total = await prisma.drop.count({
            where: { userId, deletedAt: null },
        });

        return {
            drops: (drops as DropWithFilesRelation[]).map((d) => ({
                id: d.id,
                encryptedTitle: d.encryptedTitle,
                iv: d.iv,
                downloads: d.downloads,
                maxDownloads: d.maxDownloads,
                expiresAt: d.expiresAt,
                customKey: d.customKey,
                hideBranding: d.hideBranding,
                disabled: d.disabled,
                takenDown: d.takenDown,
                takedownReason: d.takedownReason,
                uploadComplete: d.uploadComplete,
                createdAt: d.createdAt,
                files: d.files.map((f) => ({
                    id: f.id,
                    encryptedName: f.encryptedName,
                    size: f.size.toString(),
                    mimeType: f.mimeType,
                    iv: f.iv,
                })),
                fileCount: d.files.length,
                totalSize: d.files.reduce((sum: bigint, f) => sum + f.size, BigInt(0)).toString(),
            })),
            total,
        };
    }

}
