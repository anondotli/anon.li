/**
 * Drop cleanup operations for cron jobs.
 *
 * These methods handle periodic cleanup of expired, incomplete,
 * soft-deleted, download-limit-exceeded, and orphaned drops/files.
 */

import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import {
    deleteObject,
    deleteObjects,
    abortMultipartUpload,
} from "@/lib/storage";
import { decrementStorageUsed } from "@/lib/services/drop-storage";

const logger = createLogger("DropCleanupService");

export class DropCleanupService {
    /**
     * Clean up expired drops (12h grace period)
     */
    static async cleanupExpiredDrops(dryRun = false): Promise<{
        found: number;
        deleted: number;
        errors: string[];
    }> {
        const BATCH_SIZE = 100;
        const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
        let totalFound = 0;
        let totalDeleted = 0;
        const allErrors: string[] = [];

        while (true) {
            const expiredDrops = await prisma.drop.findMany({
                where: {
                    expiresAt: { lt: twelveHoursAgo },
                    deletedAt: null,
                },
                select: {
                    id: true,
                    userId: true,
                    files: { select: { id: true, storageKey: true, size: true } },
                },
                take: BATCH_SIZE,
            });

            if (expiredDrops.length === 0) break;
            totalFound += expiredDrops.length;

            if (dryRun) {
                if (expiredDrops.length < BATCH_SIZE) break;
                continue;
            }

            // Collect all keys and IDs for batch processing
            const storageKeys: string[] = [];
            const dropIds: string[] = [];

            for (const drop of expiredDrops) {
                dropIds.push(drop.id);
                for (const file of drop.files) {
                    storageKeys.push(file.storageKey);
                }
            }

            // Build per-user storage totals for quota decrement
            const userStorageMap = new Map<string, bigint>();
            for (const drop of expiredDrops) {
                if (!drop.userId) continue;
                const dropSize = drop.files.reduce((sum, f) => sum + f.size, BigInt(0));
                const current = userStorageMap.get(drop.userId) || BigInt(0);
                userStorageMap.set(drop.userId, current + dropSize);
            }

            try {
                // Batch delete files from storage
                let failedKeys: string[] = [];
                if (storageKeys.length > 0) {
                    failedKeys = await deleteObjects(storageKeys);
                }

                // Record failed keys as orphaned files
                const failedKeySet = new Set(failedKeys);
                for (const key of failedKeySet) {
                    try {
                        await prisma.orphanedFile.create({ data: { storageKey: key } });
                    } catch (e) {
                        logger.error("Failed to record orphaned file", e, { storageKey: key });
                    }
                }

                // Subtract failed file sizes from per-user quota decrements
                if (failedKeySet.size > 0) {
                    for (const drop of expiredDrops) {
                        if (!drop.userId) continue;
                        const failedSize = drop.files
                            .filter(f => failedKeySet.has(f.storageKey))
                            .reduce((sum, f) => sum + f.size, BigInt(0));
                        if (failedSize > BigInt(0)) {
                            const current = userStorageMap.get(drop.userId) || BigInt(0);
                            userStorageMap.set(drop.userId, current - failedSize);
                        }
                    }
                }

                // Batch delete drops from database
                await prisma.drop.deleteMany({
                    where: {
                        id: { in: dropIds }
                    }
                });

                // Decrement each user's storageUsed
                for (const [uid, totalSize] of userStorageMap) {
                    if (totalSize > BigInt(0)) {
                        await decrementStorageUsed(uid, totalSize);
                    }
                }

                totalDeleted += expiredDrops.length;
            } catch (e) {
                logger.error("Failed to cleanup expired drops in batch, falling back to iterative cleanup", e);

                // Fallback to iterative cleanup
                for (const drop of expiredDrops) {
                    try {
                        const failedKeys: string[] = [];
                        for (const file of drop.files) {
                            try {
                                await deleteObject(file.storageKey);
                            } catch (fileErr) {
                                logger.error(`Failed to delete file from storage`, fileErr, { fileId: file.id, dropId: drop.id });
                                failedKeys.push(file.storageKey);
                            }
                        }

                        // Record failed keys as orphaned
                        for (const key of failedKeys) {
                            try {
                                await prisma.orphanedFile.create({ data: { storageKey: key } });
                            } catch (orphanErr) {
                                logger.error("Failed to record orphaned file", orphanErr, { storageKey: key });
                            }
                        }

                        await prisma.drop.delete({ where: { id: drop.id } });

                        if (drop.userId) {
                            const failedKeySet = new Set(failedKeys);
                            const reclaimSize = drop.files
                                .filter(f => !failedKeySet.has(f.storageKey))
                                .reduce((sum, f) => sum + f.size, BigInt(0));
                            if (reclaimSize > BigInt(0)) {
                                await decrementStorageUsed(drop.userId, reclaimSize);
                            }
                        }

                        totalDeleted++;
                    } catch (e) {
                        logger.error(`Failed to delete expired drop`, e, { dropId: drop.id });
                        allErrors.push(drop.id);
                    }
                }
            }

            if (expiredDrops.length < BATCH_SIZE) break;
        }

        return { found: totalFound, deleted: totalDeleted, errors: allErrors };
    }

    /**
     * Clean up incomplete uploads (older than 6h)
     */
    static async cleanupIncompleteUploads(dryRun = false): Promise<{
        found: number;
        deleted: number;
        errors: string[];
    }> {
        const BATCH_SIZE = 100;
        const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
        let totalFound = 0;
        let totalDeleted = 0;
        const allErrors: string[] = [];

        while (true) {
            const incompleteDrops = await prisma.drop.findMany({
                where: {
                    uploadComplete: false,
                    createdAt: { lt: sixHoursAgo },
                },
                select: {
                    id: true,
                    userId: true,
                    files: { select: { id: true, storageKey: true, s3UploadId: true, size: true } },
                },
                take: BATCH_SIZE,
            });

            if (incompleteDrops.length === 0) break;
            totalFound += incompleteDrops.length;

            if (dryRun) {
                if (incompleteDrops.length < BATCH_SIZE) break;
                continue;
            }

            // Abort multipart uploads (no batch API for this)
            const storageKeysToDelete: string[] = [];
            const successfulDropIds: string[] = [];

            for (const drop of incompleteDrops) {
                try {
                    for (const file of drop.files) {
                        try {
                            if (file.s3UploadId) {
                                await abortMultipartUpload(file.storageKey, file.s3UploadId);
                            }
                        } catch {
                            // Multipart upload may already be completed or absent
                        }
                        storageKeysToDelete.push(file.storageKey);
                    }
                    successfulDropIds.push(drop.id);
                } catch (e) {
                    logger.error(`Failed to abort multipart uploads for drop`, e, { dropId: drop.id });
                    allErrors.push(drop.id);
                }
            }

            // Batch delete all storage objects (best-effort)
            if (storageKeysToDelete.length > 0) {
                try {
                    const failedKeys = await deleteObjects(storageKeysToDelete);
                    if (failedKeys.length > 0) {
                        logger.warn("Some incomplete upload files failed to delete from storage", { count: failedKeys.length });
                    }
                } catch {
                    // Best-effort: files may not exist in storage yet
                }
            }

            // Batch delete drops from database
            if (successfulDropIds.length > 0) {
                try {
                    await prisma.drop.deleteMany({
                        where: { id: { in: successfulDropIds } },
                    });
                    totalDeleted += successfulDropIds.length;
                } catch (e) {
                    logger.error("Failed to batch delete incomplete drops, falling back to iterative", e);
                    for (const dropId of successfulDropIds) {
                        try {
                            await prisma.drop.delete({ where: { id: dropId } });
                            totalDeleted++;
                        } catch (iterErr) {
                            logger.error(`Failed to delete incomplete drop`, iterErr, { dropId });
                            allErrors.push(dropId);
                        }
                    }
                }
            }

            // Batch quota decrements per user
            const userStorageMap = new Map<string, bigint>();
            for (const drop of incompleteDrops) {
                if (!drop.userId || !successfulDropIds.includes(drop.id)) continue;
                const dropSize = drop.files.reduce((sum, f) => sum + f.size, BigInt(0));
                const current = userStorageMap.get(drop.userId) || BigInt(0);
                userStorageMap.set(drop.userId, current + dropSize);
            }

            for (const [uid, totalSize] of userStorageMap) {
                try {
                    await decrementStorageUsed(uid, totalSize);
                } catch (e) {
                    logger.error("Failed to decrement storageUsed during incomplete upload cleanup", e, { userId: uid });
                }
            }

            if (incompleteDrops.length < BATCH_SIZE) break;
        }

        return { found: totalFound, deleted: totalDeleted, errors: allErrors };
    }

    /**
     * Clean up soft-deleted drops.
     *
     * Grace periods:
     * - 24h for user-initiated soft-deletes
     * - 2h for drops auto-deleted because they hit their download limit
     *   (long enough for the ~1h presigned URL handed to the final downloader
     *   to expire, short enough that orphan bytes don't accumulate)
     *
     * Always decrements the owning user's storageUsed so quota is reclaimed
     * in this single hard-delete pipeline (both user-deleted and
     * limit-reached drops flow through here).
     */
    static async cleanupSoftDeletedDrops(dryRun = false): Promise<{
        found: number;
        deleted: number;
        errors: string[];
    }> {
        const BATCH_SIZE = 100;
        const now = Date.now();
        const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
        const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000);
        let totalFound = 0;
        let totalDeleted = 0;
        const allErrors: string[] = [];

        while (true) {
            const softDeletedDrops = await prisma.drop.findMany({
                where: {
                    OR: [
                        // User-initiated soft-delete: 24h grace
                        { deletedAt: { lt: oneDayAgo } },
                        // Download-limit auto-delete: 2h grace (presigned URL lifetime + headroom)
                        {
                            deletedAt: { lt: twoHoursAgo },
                            maxDownloads: { not: null },
                            downloads: { gt: 0 },
                        },
                    ],
                },
                select: {
                    id: true,
                    userId: true,
                    downloads: true,
                    maxDownloads: true,
                    deletedAt: true,
                    files: { select: { id: true, storageKey: true, size: true } },
                },
                take: BATCH_SIZE,
            });

            // Prisma OR above is permissive; filter strictly to avoid accidentally
            // shortening grace for drops that merely had a download count set.
            const nowDate = new Date(now);
            const eligible = softDeletedDrops.filter((d) => {
                if (!d.deletedAt) return false;
                const ageMs = nowDate.getTime() - d.deletedAt.getTime();
                const isLimitReached = d.maxDownloads !== null && d.downloads >= d.maxDownloads;
                return isLimitReached ? ageMs >= 2 * 60 * 60 * 1000 : ageMs >= 24 * 60 * 60 * 1000;
            });

            if (eligible.length === 0) break;
            totalFound += eligible.length;

            if (dryRun) {
                if (eligible.length < BATCH_SIZE) break;
                continue;
            }

            const storageKeys: string[] = [];
            const dropIds: string[] = [];
            // Aggregate bytes per user for quota decrement
            const userStorageMap = new Map<string, bigint>();

            for (const drop of eligible) {
                dropIds.push(drop.id);
                let dropBytes = BigInt(0);
                for (const file of drop.files) {
                    if (file.storageKey) {
                        storageKeys.push(file.storageKey);
                    }
                    dropBytes += file.size;
                }
                if (drop.userId) {
                    const current = userStorageMap.get(drop.userId) || BigInt(0);
                    userStorageMap.set(drop.userId, current + dropBytes);
                }
            }

            try {
                let failedKeys: string[] = [];
                if (storageKeys.length > 0) {
                    try {
                        failedKeys = await deleteObjects(storageKeys);
                    } catch (e) {
                        logger.error("Failed to batch delete files from storage, aborting DB cleanup", e);
                        allErrors.push(...dropIds);
                        break;
                    }
                }

                // Record failed keys as orphaned files
                for (const key of failedKeys) {
                    try {
                        await prisma.orphanedFile.create({ data: { storageKey: key } });
                    } catch (e) {
                        logger.error("Failed to record orphaned file", e, { storageKey: key });
                    }
                }

                let deletedCount = 0;
                if (dropIds.length > 0) {
                    const result = await prisma.drop.deleteMany({
                        where: {
                            id: { in: dropIds }
                        }
                    });
                    deletedCount = result.count;
                }

                // Reclaim quota for each owning user
                for (const [uid, totalSize] of userStorageMap) {
                    try {
                        await decrementStorageUsed(uid, totalSize);
                    } catch (e) {
                        logger.error("Failed to decrement storageUsed for soft-deleted drop", e, { userId: uid });
                    }
                }

                totalDeleted += deletedCount;
            } catch (e) {
                logger.error("Failed to batch cleanup soft-deleted drops", e);
                allErrors.push(...dropIds);
                break;
            }

            if (eligible.length < BATCH_SIZE) break;
        }

        return { found: totalFound, deleted: totalDeleted, errors: allErrors };
    }

    /**
     * Fallback: soft-delete drops that have exceeded their download limit but
     * were never marked deletedAt by incrementDownloadCount (e.g. the
     * markDropLimitReached UPDATE failed). Storage deletion and quota
     * reclamation happen in cleanupSoftDeletedDrops on the next pass — we do
     * NOT delete storage here, because doing so would race with the single
     * deletion pipeline and risk double-decrementing quota.
     */
    static async cleanupDownloadLimitExceededDrops(dryRun = false): Promise<{
        found: number;
        deleted: number;
        errors: string[];
    }> {
        const BATCH_SIZE = 100;
        let totalFound = 0;
        let totalDeleted = 0;
        const allErrors: string[] = [];

        while (true) {
            const exceededDrops = await prisma.$queryRaw<Array<{
                id: string;
                downloads: number;
                maxDownloads: number;
            }>>`
                SELECT id, downloads, "maxDownloads"
                FROM "drops"
                WHERE "maxDownloads" IS NOT NULL
                  AND downloads >= "maxDownloads"
                  AND "deletedAt" IS NULL
                LIMIT ${BATCH_SIZE}
            `;

            if (exceededDrops.length === 0) break;
            totalFound += exceededDrops.length;

            if (dryRun) {
                if (exceededDrops.length < BATCH_SIZE) break;
                continue;
            }

            const dropIds = exceededDrops.map((d) => d.id);

            try {
                const result = await prisma.drop.updateMany({
                    where: { id: { in: dropIds }, deletedAt: null },
                    data: { deletedAt: new Date() },
                });
                totalDeleted += result.count;
                for (const drop of exceededDrops) {
                    logger.info(`Soft-deleted drop (download limit fallback)`, {
                        dropId: drop.id,
                        downloads: drop.downloads,
                        maxDownloads: drop.maxDownloads,
                    });
                }
            } catch (e) {
                logger.error("Failed to soft-delete download-limit-exceeded drops", e);
                allErrors.push(...dropIds);
                break;
            }

            if (exceededDrops.length < BATCH_SIZE) break;
        }

        return { found: totalFound, deleted: totalDeleted, errors: allErrors };
    }

    /**
     * Clean up orphaned files (files that were hard-deleted but remain in storage)
     */
    static async cleanupOrphanedFiles(dryRun = false): Promise<{
        found: number;
        deleted: number;
        errors: string[];
    }> {
        const BATCH_SIZE = 100;
        let totalFound = 0;
        let totalDeleted = 0;
        const allErrors: string[] = [];

        while (true) {
            const orphanedFiles = await prisma.orphanedFile.findMany({
                take: BATCH_SIZE,
                orderBy: { createdAt: "asc" }
            });

            if (orphanedFiles.length === 0) break;
            totalFound += orphanedFiles.length;

            if (dryRun) {
                if (orphanedFiles.length < BATCH_SIZE) break;
                continue;
            }

            const storageKeys = orphanedFiles.map((f) => f.storageKey);

            try {
                const failedKeys = await deleteObjects(storageKeys);
                const failedKeySet = new Set(failedKeys);

                // Only remove DB records for successfully deleted keys
                const successfulIds = orphanedFiles
                    .filter(f => !failedKeySet.has(f.storageKey))
                    .map(f => f.id);

                if (successfulIds.length > 0) {
                    await prisma.orphanedFile.deleteMany({
                        where: { id: { in: successfulIds } }
                    });
                }

                totalDeleted += successfulIds.length;

                if (failedKeys.length > 0) {
                    allErrors.push(...orphanedFiles
                        .filter(f => failedKeySet.has(f.storageKey))
                        .map(f => f.id));
                }
            } catch (e) {
                logger.error("Failed to batch cleanup orphaned files, falling back to iterative", e);

                for (const file of orphanedFiles) {
                    try {
                        await deleteObject(file.storageKey);
                        await prisma.orphanedFile.delete({
                            where: { id: file.id }
                        });
                        totalDeleted++;
                    } catch (err) {
                        logger.error("Failed to delete orphaned file", err, { id: file.id, key: file.storageKey });
                        allErrors.push(file.id);
                    }
                }
            }

            if (orphanedFiles.length < BATCH_SIZE) break;
        }

        return { found: totalFound, deleted: totalDeleted, errors: allErrors };
    }

    /**
     * Clean up incomplete individual files within completed drops.
     * These are files where addFile() reserved quota but the upload was never
     * completed or aborted, while the parent drop itself was finalized.
     */
    static async cleanupIncompleteFiles(dryRun = false): Promise<{
        found: number;
        deleted: number;
        errors: string[];
    }> {
        const BATCH_SIZE = 100;
        const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
        let totalFound = 0;
        let totalDeleted = 0;
        const allErrors: string[] = [];

        while (true) {
            const incompleteFiles = await prisma.dropFile.findMany({
                where: {
                    uploadComplete: false,
                    createdAt: { lt: sixHoursAgo },
                    drop: { uploadComplete: true },
                },
                select: {
                    id: true,
                    storageKey: true,
                    s3UploadId: true,
                    size: true,
                    drop: { select: { userId: true } },
                },
                take: BATCH_SIZE,
            });

            if (incompleteFiles.length === 0) break;
            totalFound += incompleteFiles.length;

            if (dryRun) {
                if (incompleteFiles.length < BATCH_SIZE) break;
                continue;
            }

            // Aggregate quota to reclaim per user
            const userStorageMap = new Map<string, bigint>();

            for (const file of incompleteFiles) {
                try {
                    // Abort S3 multipart upload if present
                    if (file.s3UploadId) {
                        try {
                            await abortMultipartUpload(file.storageKey, file.s3UploadId);
                        } catch {
                            // May already be completed or absent
                        }
                    }

                    // Delete the file record
                    await prisma.dropFile.delete({ where: { id: file.id } });
                    totalDeleted++;

                    // Track quota to reclaim
                    if (file.drop.userId && file.size > BigInt(0)) {
                        const current = userStorageMap.get(file.drop.userId) || BigInt(0);
                        userStorageMap.set(file.drop.userId, current + file.size);
                    }
                } catch (err) {
                    logger.error("Failed to clean up incomplete file", err, { fileId: file.id });
                    allErrors.push(file.id);
                }
            }

            // Batch quota decrements per user
            for (const [uid, totalSize] of userStorageMap) {
                try {
                    await decrementStorageUsed(uid, totalSize);
                } catch (e) {
                    logger.error("Failed to decrement storageUsed during incomplete file cleanup", e, { userId: uid });
                }
            }

            if (incompleteFiles.length < BATCH_SIZE) break;
        }

        return { found: totalFound, deleted: totalDeleted, errors: allErrors };
    }
}
