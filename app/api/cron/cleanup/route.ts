import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { validateCronAuth } from "@/lib/cron-auth";
import { createLogger } from "@/lib/logger";
import { withCronLock } from "@/lib/cron-lock";

const logger = createLogger("CronCleanup");

async function cleanupExpiredSessions(): Promise<number> {
    const result = await prisma.session.deleteMany({
        where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
}

async function handleCron(req: NextRequest) {
    if (!validateCronAuth(req, "cleanup")) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    // Redis-backed lock: prevents overlapping runs across concurrent Vercel
    // cron invocations or manual triggers. 15-minute TTL is the crash-safety
    // net - normal runs release the lock in the finally block.
    const result = await withCronLock("drop-cleanup", 15 * 60, () => runCleanup());
    if (result === null) {
        return NextResponse.json({ success: true, skipped: "lock-held" });
    }
    return result;
}

async function runCleanup(): Promise<NextResponse> {
    try {
        const now = new Date();

        const { DropCleanupService } = await import("@/lib/services/drop-cleanup");
        const { FormCleanupService } = await import("@/lib/services/form-cleanup");

        const emptyResult = { found: 0, deleted: 0, errors: [] as string[] };
        const taskErrors: string[] = [];

        // Run cleanup classes SEQUENTIALLY in an order that makes their
        // predicates effectively non-overlapping in execution:
        //   1. cleanupIncompleteUploads     - removes orphan uploadComplete=false drops first
        //   2. cleanupIncompleteFiles       - per-file orphans on otherwise-complete drops
        //   3. cleanupDownloadLimitExceededDrops - soft-delete fallback only
        //   4. cleanupExpiredDrops          - expired drops that weren't soft-deleted yet
        //   5. cleanupSoftDeletedDrops      - single hard-delete+quota-reclaim pipeline
        //   6. cleanupExpiredFormSubmissions - form retention, deleting attached drops
        //   7. cleanupDeletedForms          - hard-delete soft-deleted forms after grace
        //   8. cleanupOrphanedFiles         - storage-only GC of previously failed deletes
        //   9. cleanupExpiredSessions       - unrelated
        type DropResult = { found: number; deleted: number; errors: string[] };
        async function runTask<T>(name: string, fallback: T, fn: () => Promise<T>): Promise<T> {
            try {
                return await fn();
            } catch (err) {
                logger.error(`Cleanup task "${name}" failed`, err);
                taskErrors.push(`${name}: ${(err as Error)?.message || "unknown error"}`);
                return fallback;
            }
        }

        const { deleted: incompleteUploadsDeleted, errors: incompleteErrors } = await runTask<DropResult>(
            "incompleteUploads",
            emptyResult,
            () => DropCleanupService.cleanupIncompleteUploads()
        );
        const { deleted: incompleteFilesDeleted, errors: incompleteFileErrors } = await runTask<DropResult>(
            "incompleteFiles",
            emptyResult,
            () => DropCleanupService.cleanupIncompleteFiles()
        );
        const { deleted: downloadLimitExceededDeleted, errors: downloadLimitErrors } = await runTask<DropResult>(
            "downloadLimitExceeded",
            emptyResult,
            () => DropCleanupService.cleanupDownloadLimitExceededDrops()
        );
        const { deleted: dropsDeleted, found: expiredDropsFound, errors: dropErrors } = await runTask<DropResult>(
            "expiredDrops",
            emptyResult,
            () => DropCleanupService.cleanupExpiredDrops()
        );
        const { deleted: softDeletedCleaned, errors: softDeleteErrors } = await runTask<DropResult>(
            "softDeleted",
            emptyResult,
            () => DropCleanupService.cleanupSoftDeletedDrops()
        );
        const {
            deleted: expiredFormSubmissionsDeleted,
            found: expiredFormSubmissionsFound,
            errors: expiredFormSubmissionErrors,
        } = await runTask<DropResult>(
            "expiredFormSubmissions",
            emptyResult,
            () => FormCleanupService.cleanupExpiredSubmissions()
        );
        const {
            deleted: deletedFormsCleaned,
            found: deletedFormsFound,
            errors: deletedFormErrors,
        } = await runTask<DropResult>(
            "deletedForms",
            emptyResult,
            () => FormCleanupService.cleanupDeletedForms()
        );
        const { deleted: orphanedFilesDeleted, errors: orphanedErrors } = await runTask<DropResult>(
            "orphanedFiles",
            emptyResult,
            () => DropCleanupService.cleanupOrphanedFiles()
        );
        const expiredSessionsDeleted = await runTask<number>(
            "expiredSessions",
            0,
            () => cleanupExpiredSessions()
        );

        const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const fortyEightHoursFromNow = new Date(now.getTime() + 48 * 60 * 60 * 1000);

        const expiringDrops = await prisma.drop.findMany({
            where: {
                expiresAt: {
                    gte: twentyFourHoursFromNow,
                    lt: fortyEightHoursFromNow,
                },
                deletedAt: null,
                userId: { not: null },
                expiryNotifiedAt: null,
            },
            select: {
                id: true,
                encryptedTitle: true,
                expiresAt: true,
                user: { select: { email: true } },
            },
        });

        let expiringNotificationsSent = 0;
        for (const drop of expiringDrops) {
            if (drop.user?.email && drop.expiresAt) {
                try {
                    const { sendDropExpiringEmail } = await import("@/lib/resend");
                    const hoursRemaining = Math.ceil((drop.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60));
                    // Can't decrypt title server-side (by design), use generic description
                    const displayName = "one of your drops";
                    await sendDropExpiringEmail(drop.user.email, displayName, drop.id, hoursRemaining);
                    await prisma.drop.update({
                        where: { id: drop.id },
                        data: { expiryNotifiedAt: now },
                    });
                    expiringNotificationsSent++;
                } catch (e) {
                    logger.error("Failed to send expiry notification", e, { dropId: drop.id });
                }
            }
        }

        // Collect all errors
        const allErrors = [
            ...taskErrors,
            ...dropErrors,
            ...incompleteErrors,
            ...downloadLimitErrors,
            ...softDeleteErrors,
            ...orphanedErrors,
            ...incompleteFileErrors,
            ...expiredFormSubmissionErrors,
            ...deletedFormErrors,
        ];

        return NextResponse.json({
            success: true,
            expiredDropsDeleted: dropsDeleted,
            expiredDropsFound: expiredDropsFound,
            incompleteUploadsDeleted: incompleteUploadsDeleted,
            downloadLimitExceededDeleted: downloadLimitExceededDeleted,
            softDeletedDropsCleaned: softDeletedCleaned,
            expiredFormSubmissionsDeleted: expiredFormSubmissionsDeleted,
            expiredFormSubmissionsFound: expiredFormSubmissionsFound,
            deletedFormsCleaned: deletedFormsCleaned,
            deletedFormsFound: deletedFormsFound,
            orphanedFilesDeleted: orphanedFilesDeleted,
            incompleteFilesDeleted: incompleteFilesDeleted,
            expiredSessionsDeleted: expiredSessionsDeleted,
            expiringNotificationsSent: expiringNotificationsSent,
            errors: allErrors.length > 0 ? allErrors : undefined,
        });
    } catch (error) {
        logger.error("Cleanup failed", error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export { handleCron as GET, handleCron as POST };
