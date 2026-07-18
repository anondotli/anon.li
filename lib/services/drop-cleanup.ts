/**
 * Drop cleanup operations for cron jobs.
 *
 * These methods handle periodic cleanup of expired, incomplete,
 * soft-deleted, download-limit-exceeded, and orphaned drops/files.
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { createLogger } from "@/lib/logger";
import {
    deleteObject,
    deleteObjects,
    abortMultipartUpload,
} from "@/lib/storage";
import {
    deleteDropFileAndReleaseQuota,
    deleteDropFilesAndReleaseQuota,
    deleteStaleUploadFilesAndReleaseQuota,
    type ClaimedDropFile,
} from "@/lib/services/drop-storage";

const logger = createLogger("DropCleanupService");

async function deleteClaimedStorage(files: ClaimedDropFile[]): Promise<string[]> {
    if (files.length === 0) return [];

    for (const file of files) {
        if (!file.s3UploadId) continue;
        try {
            await abortMultipartUpload(file.storageKey, file.s3UploadId);
        } catch {
            // It may already be completed/aborted. DeleteObject handles the
            // completed-object case; abandoned multipart parts expire in R2.
        }
    }

    const keys = files.map((file) => file.storageKey);
    try {
        return await deleteObjects(keys);
    } catch (error) {
        logger.error("Batch storage deletion failed; falling back to individual objects", error);
        const failedKeys: string[] = [];
        for (const file of files) {
            try {
                await deleteObject(file.storageKey);
            } catch (fileError) {
                logger.error("Failed to delete claimed storage object", fileError, {
                    storageKey: file.storageKey,
                });
                failedKeys.push(file.storageKey);
            }
        }
        return failedKeys;
    }
}

async function recordOrphanedStorageKeys(keys: Iterable<string>): Promise<void> {
    for (const storageKey of new Set(keys)) {
        try {
            await prisma.orphanedFile.create({ data: { storageKey } });
        } catch (error) {
            logger.error("Failed to record orphaned file", error, { storageKey });
        }
    }
}

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

        if (dryRun) {
            const found = await prisma.drop.count({
                where: {
                    expiresAt: { lt: twelveHoursAgo },
                    deletedAt: null,
                },
            });
            return { found, deleted: 0, errors: [] };
        }

        while (true) {
            const expiredDrops = await prisma.drop.findMany({
                where: {
                    expiresAt: { lt: twelveHoursAgo },
                    deletedAt: null,
                },
                select: { id: true },
                take: BATCH_SIZE,
            });

            if (expiredDrops.length === 0) break;
            totalFound += expiredDrops.length;

            const dropIds: string[] = [];
            const claimedFiles: ClaimedDropFile[] = [];
            let batchHadDatabaseError = false;
            for (const drop of expiredDrops) {
                try {
                    const claim = await deleteDropFilesAndReleaseQuota(drop.id);
                    dropIds.push(drop.id);
                    claimedFiles.push(...claim.files);
                } catch (error) {
                    logger.error("Failed to claim expired drop", error, { dropId: drop.id });
                    allErrors.push(drop.id);
                    batchHadDatabaseError = true;
                }
            }

            const failedKeys = await deleteClaimedStorage(claimedFiles);
            await recordOrphanedStorageKeys(failedKeys);

            if (dropIds.length > 0) {
                try {
                    const deleted = await prisma.drop.deleteMany({
                        where: { id: { in: dropIds } }
                    });
                    totalDeleted += deleted.count;
                } catch (error) {
                    logger.error("Failed to delete claimed expired drops", error);
                    allErrors.push(...dropIds);
                    break;
                }
            }

            if (batchHadDatabaseError || expiredDrops.length < BATCH_SIZE) break;
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
        const now = new Date();
        const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
        const staleWhere = {
            deletedAt: null,
            OR: [
                { uploadComplete: false, createdAt: { lt: sixHoursAgo } },
                {
                    // Completed Form uploads remain private staging until their
                    // token is consumed by a submission. Reap abandoned staging
                    // as soon as its shorter Form token expires; formStagingId
                    // remains even if Form deletion cascades the token.
                    formStagingId: { not: null },
                    formSubmission: null,
                    OR: [
                        { createdAt: { lt: sixHoursAgo } },
                        {
                            uploadTokens: {
                                none: {
                                    formId: { not: null },
                                    expiresAt: { gt: now },
                                },
                            },
                        },
                    ],
                },
            ],
        } satisfies Prisma.DropWhereInput;
        let totalFound = 0;
        let totalDeleted = 0;
        const allErrors: string[] = [];

        if (dryRun) {
            const found = await prisma.drop.count({
                where: staleWhere,
            });
            return { found, deleted: 0, errors: [] };
        }

        while (true) {
            const incompleteDrops = await prisma.drop.findMany({
                where: staleWhere,
                select: { id: true },
                take: BATCH_SIZE,
            });

            if (incompleteDrops.length === 0) break;
            totalFound += incompleteDrops.length;

            const deletableDropIds: string[] = [];
            const claimedFiles: ClaimedDropFile[] = [];
            let batchHadDatabaseError = false;
            for (const drop of incompleteDrops) {
                try {
                    const claim = await deleteStaleUploadFilesAndReleaseQuota(
                        drop.id,
                        sixHoursAgo,
                        now,
                    );
                    if (!claim) continue;
                    deletableDropIds.push(drop.id);
                    claimedFiles.push(...claim.files);
                } catch (e) {
                    logger.error("Failed to claim incomplete drop", e, { dropId: drop.id });
                    allErrors.push(drop.id);
                    batchHadDatabaseError = true;
                }
            }

            const failedKeys = await deleteClaimedStorage(claimedFiles);
            await recordOrphanedStorageKeys(failedKeys);

            // Batch delete drops from database
            if (deletableDropIds.length > 0) {
                try {
                    const deleted = await prisma.drop.deleteMany({
                        where: { id: { in: deletableDropIds } },
                    });
                    totalDeleted += deleted.count;
                } catch (e) {
                    logger.error("Failed to batch delete incomplete drops, falling back to iterative", e);
                    for (const dropId of deletableDropIds) {
                        try {
                            const deleted = await prisma.drop.deleteMany({ where: { id: dropId } });
                            totalDeleted += deleted.count;
                        } catch (iterErr) {
                            logger.error(`Failed to delete incomplete drop`, iterErr, { dropId });
                            allErrors.push(dropId);
                        }
                    }
                }
            }

            if (batchHadDatabaseError || incompleteDrops.length < BATCH_SIZE) break;
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
     * Atomically releases the owning user's storage reservation in this single
     * hard-delete pipeline (both user-deleted and limit-reached drops flow here).
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

        if (dryRun) {
            const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
                SELECT COUNT(*)::bigint AS "count"
                FROM "drops"
                WHERE "deletedAt" IS NOT NULL
                  AND (
                    "deletedAt" < ${oneDayAgo}
                    OR (
                        "deletedAt" < ${twoHoursAgo}
                        AND "maxDownloads" IS NOT NULL
                        AND "downloads" >= "maxDownloads"
                    )
                  )
            `;
            return {
                found: Number(rows[0]?.count ?? BigInt(0)),
                deleted: 0,
                errors: [],
            };
        }

        while (true) {
            // Compare the two columns in SQL. The previous broad Prisma query
            // fetched any 2h-old limited drop and filtered in memory; a full
            // first page of non-limit-reached rows could hide eligible rows and
            // make cleanup stop forever.
            const eligibleIds = await prisma.$queryRaw<Array<{ id: string }>>`
                SELECT "id"
                FROM "drops"
                WHERE "deletedAt" IS NOT NULL
                  AND (
                    "deletedAt" < ${oneDayAgo}
                    OR (
                        "deletedAt" < ${twoHoursAgo}
                        AND "maxDownloads" IS NOT NULL
                        AND "downloads" >= "maxDownloads"
                    )
                  )
                ORDER BY "deletedAt" ASC, "id" ASC
                LIMIT ${BATCH_SIZE}
            `;

            if (eligibleIds.length === 0) break;

            const eligible = await prisma.drop.findMany({
                where: { id: { in: eligibleIds.map((drop) => drop.id) } },
                select: { id: true },
            });

            // Rows may have been concurrently deleted after the ID scan.
            if (eligible.length === 0) continue;
            totalFound += eligible.length;

            const deletableDropIds: string[] = [];
            const claimedFiles: ClaimedDropFile[] = [];
            let batchHadDatabaseError = false;

            for (const drop of eligible) {
                try {
                    const claim = await deleteDropFilesAndReleaseQuota(drop.id);
                    deletableDropIds.push(drop.id);
                    claimedFiles.push(...claim.files);
                } catch (error) {
                    logger.error("Failed to claim soft-deleted drop", error, { dropId: drop.id });
                    allErrors.push(drop.id);
                    batchHadDatabaseError = true;
                }
            }

            const failedKeys = await deleteClaimedStorage(claimedFiles);
            await recordOrphanedStorageKeys(failedKeys);

            try {
                if (deletableDropIds.length > 0) {
                    const result = await prisma.drop.deleteMany({
                        where: {
                            id: { in: deletableDropIds }
                        }
                    });
                    totalDeleted += result.count;
                }
            } catch (e) {
                logger.error("Failed to batch cleanup soft-deleted drops", e);
                allErrors.push(...deletableDropIds);
                break;
            }

            if (batchHadDatabaseError || eligibleIds.length < BATCH_SIZE) break;
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

        if (dryRun) {
            const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
                SELECT COUNT(*)::bigint AS "count"
                FROM "drops"
                WHERE "maxDownloads" IS NOT NULL
                  AND "downloads" >= "maxDownloads"
                  AND "deletedAt" IS NULL
            `;
            return {
                found: Number(rows[0]?.count ?? BigInt(0)),
                deleted: 0,
                errors: [],
            };
        }

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

        if (dryRun) {
            const found = await prisma.orphanedFile.count();
            return { found, deleted: 0, errors: [] };
        }

        while (true) {
            const orphanedFiles = await prisma.orphanedFile.findMany({
                take: BATCH_SIZE,
                orderBy: { createdAt: "asc" }
            });

            if (orphanedFiles.length === 0) break;
            totalFound += orphanedFiles.length;

            const storageKeys = orphanedFiles.map((f) => f.storageKey);
            let batchHadStorageError = false;

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
                    batchHadStorageError = true;
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
                        batchHadStorageError = true;
                    }
                }
            }

            if (batchHadStorageError || orphanedFiles.length < BATCH_SIZE) break;
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

        const incompleteWhere = {
            uploadComplete: false,
            createdAt: { lt: sixHoursAgo },
            drop: { uploadComplete: true },
        } as const;

        if (dryRun) {
            const found = await prisma.dropFile.count({ where: incompleteWhere });
            return { found, deleted: 0, errors: [] };
        }

        while (true) {
            const incompleteFiles = await prisma.dropFile.findMany({
                where: incompleteWhere,
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

            let batchHadDatabaseError = false;
            for (const file of incompleteFiles) {
                try {
                    // Delete the row and reclaim its reservation as one atomic
                    // claim before touching object storage. If a finalizer has
                    // the row lock, its object write completes before DELETE
                    // returns; if another cleanup won, this worker gets null and
                    // must not delete storage it no longer owns.
                    const claimed = await deleteDropFileAndReleaseQuota(file.id);
                    if (!claimed) continue;

                    const failedKeys = await deleteClaimedStorage([claimed]);
                    await recordOrphanedStorageKeys(failedKeys);
                    totalDeleted++;
                } catch (err) {
                    logger.error("Failed to clean up incomplete file", err, { fileId: file.id });
                    allErrors.push(file.id);
                    batchHadDatabaseError = true;
                }
            }

            if (batchHadDatabaseError || incompleteFiles.length < BATCH_SIZE) break;
        }

        return { found: totalFound, deleted: totalDeleted, errors: allErrors };
    }
}
