import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

/**
 * Atomically remove a DropFile row and release exactly that row's reservation
 * from its owning account or organization. The quota owner is derived in SQL,
 * so an authorized team member cannot release bytes from the wrong counter.
 * The DELETE CTE makes retries idempotent.
 */
export interface ClaimedDropFile {
    storageKey: string;
    s3UploadId: string | null;
    size: bigint;
}

export async function deleteDropFileAndReleaseQuota(
    fileId: string,
): Promise<ClaimedDropFile | null> {
    const rows = await prisma.$queryRaw<ClaimedDropFile[]>`
        WITH deleted_file AS (
            DELETE FROM "drop_files"
            WHERE "id" = ${fileId}
            RETURNING "dropId", "storageKey", "s3UploadId", "size"
        ),
        user_quota_update AS (
            UPDATE "users" AS owner
            SET "storageUsed" = GREATEST(
                0::bigint,
                owner."storageUsed" - deleted_file."size"
            )
            FROM deleted_file, "drops" AS parent
            WHERE parent."id" = deleted_file."dropId"
              AND parent."organizationId" IS NULL
              AND owner."id" = parent."userId"
            RETURNING owner."id"
        ),
        organization_quota_update AS (
            UPDATE "organizations" AS owner
            SET "storageUsed" = GREATEST(
                0::bigint,
                owner."storageUsed" - deleted_file."size"
            )
            FROM deleted_file, "drops" AS parent
            WHERE parent."id" = deleted_file."dropId"
              AND owner."id" = parent."organizationId"
            RETURNING owner."id"
        )
        SELECT
            "storageKey",
            "s3UploadId",
            "size"
        FROM deleted_file
    `;

    return rows[0] ?? null;
}

/**
 * Atomically claim an incomplete DropFile and release its reservation.
 *
 * User-requested aborts must not delete a file that a concurrent finalizer has
 * already committed. The uploadComplete predicate is evaluated by the DELETE
 * itself, so a completed file or a race-losing retry returns null and gives the
 * caller no storage key to touch.
 */
export async function deletePendingDropFileAndReleaseQuota(
    fileId: string,
): Promise<ClaimedDropFile | null> {
    const rows = await prisma.$queryRaw<ClaimedDropFile[]>`
        WITH deleted_file AS (
            DELETE FROM "drop_files"
            WHERE "id" = ${fileId}
              AND "uploadComplete" = FALSE
            RETURNING "dropId", "storageKey", "s3UploadId", "size"
        ),
        user_quota_update AS (
            UPDATE "users" AS owner
            SET "storageUsed" = GREATEST(
                0::bigint,
                owner."storageUsed" - deleted_file."size"
            )
            FROM deleted_file, "drops" AS parent
            WHERE parent."id" = deleted_file."dropId"
              AND parent."organizationId" IS NULL
              AND owner."id" = parent."userId"
            RETURNING owner."id"
        ),
        organization_quota_update AS (
            UPDATE "organizations" AS owner
            SET "storageUsed" = GREATEST(
                0::bigint,
                owner."storageUsed" - deleted_file."size"
            )
            FROM deleted_file, "drops" AS parent
            WHERE parent."id" = deleted_file."dropId"
              AND owner."id" = parent."organizationId"
            RETURNING owner."id"
        )
        SELECT
            "storageKey",
            "s3UploadId",
            "size"
        FROM deleted_file
    `;

    return rows[0] ?? null;
}

export interface DropFilesQuotaRelease {
    files: ClaimedDropFile[];
    deletedFiles: number;
    releasedBytes: bigint;
}

/**
 * Atomically claim every remaining file row for a drop and release the exact
 * number of bytes claimed from the drop owner's quota.
 *
 * Whole-drop deletion paths must use this before deleting the parent Drop row.
 * A competing cleanup, admin action, or user deletion can select the same rows,
 * but PostgreSQL lets only one caller DELETE each row; the quota update is based
 * exclusively on that DELETE ... RETURNING result.
 *
 * The Drop is also atomically marked deleted before its files are claimed. File
 * reservation transactions lock/re-check that marker, preventing a new file
 * from being inserted in the gap before the parent row is hard-deleted. The
 * owner is read inside the transaction; guest drops naturally match no user.
 */
async function claimDropFilesAndReleaseQuota(
    dropId: string,
    guard: Prisma.Sql = Prisma.empty,
): Promise<DropFilesQuotaRelease | null> {
    return prisma.$transaction(async (tx) => {
        // This must be a separate statement from the child DELETE. At READ
        // COMMITTED, a reservation transaction that already holds the parent
        // lock can finish its child insert before this UPDATE proceeds; the
        // following DELETE then receives a fresh snapshot and sees that row.
        // A single data-modifying CTE would retain its statement-start snapshot
        // and could miss the newly committed child before the parent cascade.
        const targets = await tx.$queryRaw<Array<{
            id: string;
            userId: string | null;
            organizationId: string | null;
        }>>`
            UPDATE "drops" AS target
            SET "deletedAt" = COALESCE("deletedAt", NOW())
            WHERE target."id" = ${dropId}
            ${guard}
            RETURNING target."id", target."userId", target."organizationId"
        `;
        const target = targets[0];
        if (!target) {
            return null;
        }

        const files = await tx.$queryRaw<ClaimedDropFile[]>`
            DELETE FROM "drop_files"
            WHERE "dropId" = ${target.id}
            RETURNING "storageKey", "s3UploadId", "size"
        `;
        const releasedBytes = files.reduce(
            (total, file) => total + file.size,
            BigInt(0),
        );

        if (target.organizationId && releasedBytes > BigInt(0)) {
            await tx.$executeRaw`
                UPDATE "organizations"
                SET "storageUsed" = GREATEST(
                    0::bigint,
                    "storageUsed" - ${releasedBytes}
                )
                WHERE "id" = ${target.organizationId}
            `;
        } else if (target.userId && releasedBytes > BigInt(0)) {
            await tx.$executeRaw`
                UPDATE "users"
                SET "storageUsed" = GREATEST(
                    0::bigint,
                    "storageUsed" - ${releasedBytes}
                )
                WHERE "id" = ${target.userId}
            `;
        }

        return {
            files,
            deletedFiles: files.length,
            releasedBytes,
        };
    }, { isolationLevel: "ReadCommitted" });
}

export async function deleteDropFilesAndReleaseQuota(
    dropId: string,
): Promise<DropFilesQuotaRelease> {
    return (await claimDropFilesAndReleaseQuota(dropId)) ?? {
        files: [],
        deletedFiles: 0,
        releasedBytes: BigInt(0),
    };
}

/**
 * Claim an abandoned upload only if it is still stale at the instant the Drop
 * row is locked. A Form submission clears form_staging_id in its transaction,
 * so cleanup can never delete an attachment that just became accepted.
 */
export async function deleteStaleUploadFilesAndReleaseQuota(
    dropId: string,
    incompleteBefore: Date,
    now: Date,
): Promise<DropFilesQuotaRelease | null> {
    return claimDropFilesAndReleaseQuota(dropId, Prisma.sql`
        AND target."deletedAt" IS NULL
        AND (
            (
                target."uploadComplete" = FALSE
                AND target."createdAt" < ${incompleteBefore}
            )
            OR (
                target."form_staging_id" IS NOT NULL
                AND NOT EXISTS (
                    SELECT 1
                    FROM "form_submissions" AS submission
                    WHERE submission."attachedDropId" = target."id"
                )
                AND (
                    target."createdAt" < ${incompleteBefore}
                    OR NOT EXISTS (
                        SELECT 1
                        FROM "upload_tokens" AS token
                        WHERE token."dropId" = target."id"
                          AND token."formId" IS NOT NULL
                          AND token."expiresAt" > ${now}
                    )
                )
            )
        )
    `);
}
