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
import { getDropLimits, getEffectiveTier, assertOrgPlanActive } from "@/lib/limits";
import { getOrgLimitContext } from "@/lib/data/auth";
import {
    generateStorageKey,
    initiateMultipartUpload,
    completeMultipartUpload,
    abortMultipartUpload,
    deleteObject,
    deleteObjects,
    getObjectMetadata,
} from "@/lib/storage";
import type { Drop, Prisma } from "@prisma/client";
import {
    ValidationError,
    NotFoundError,
    ForbiddenError,
    RateLimitError,
    ServiceUnavailableError,
    UpgradeRequiredError,
} from "@/lib/api-error-utils";
import { ownerWhere, assertCanManage, isWithinScope, type OwnerScope } from "@/lib/ownership";
import { deleteDropFileAndReleaseQuota, deleteDropFilesAndReleaseQuota } from "@/lib/services/drop-storage";
import { generateRecipientToken } from "@/lib/services/drop-recipient";
import {
    DROP_FEATURES,
    GUEST_MAX_DROP_BYTES,
    GUEST_MAX_FILES_PER_DROP,
    PLAN_ENTITLEMENTS,
} from "@/config/plans";
import { pMapLimit } from "@/lib/async-utils";
import { encryptedStorageLimit, plaintextSizeFromEncrypted } from "@/lib/drop-size";

// ID generator: lowercase alphanumeric, 16 chars = ~83 bits of entropy
const generateDropId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 16);
const generateFileId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 10);

const logger = createLogger("DropService");

/** Internal sentinel used to roll back an interactive download transaction. */
class DownloadAccessDeniedError extends Error {}

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

interface AddFileOptions {
    quotaOverride?: {
        maxFileSize: number;
        storageLimit: bigint;
        currentTier: "free" | "plus" | "pro";
    };
}

const MAX_PENDING_FILES_PER_DROP = 50;
const MAX_INCOMPLETE_DROPS_PER_USER = 10;
const UPLOAD_CHUNK_INSERT_BATCH_SIZE = 1_000;
const CHUNK_FINALIZATION_BATCH_SIZE = 500;
const FILE_COMPLETION_CONCURRENCY = 4;
const FILE_FINALIZATION_TRANSACTION_TIMEOUT_MS = 120_000;
const FILE_FINALIZATION_TRANSACTION_MAX_WAIT_MS = 10_000;
const GUEST_ENCRYPTED_STORAGE_LIMIT = encryptedStorageLimit(
    BigInt(GUEST_MAX_DROP_BYTES),
    GUEST_MAX_FILES_PER_DROP,
);

interface FileReservationInput extends AddFileInput {
    fileId: string;
    storageKey: string;
    s3UploadId: string;
}

interface AuthenticatedFileReservationInput extends FileReservationInput {
    ownerUserId: string;
    organizationId: string | null;
    storageLimit: bigint;
    quotaExceededError: UpgradeRequiredError;
    dropPlaintextLimit?: number;
    dropSizeExceededError?: UpgradeRequiredError;
}

interface LockedUploadDrop {
    id: string;
    maxFileCount: number | null;
    uploadComplete: boolean;
    deletedAt: Date | null;
    userId: string | null;
    organizationId: string | null;
}

interface LockedFinalizationFile {
    id: string;
    declaredSize: bigint;
    storageKey: string;
    s3UploadId: string | null;
    uploadComplete: boolean;
    dropId: string;
    ownerUserId: string | null;
    organizationId: string | null;
    dropDeletedAt: Date | null;
}

type FileFinalizationResult =
    | { status: "already_complete" | "completed" }
    | {
        status: "invalid_size";
        message: string;
        storageKey: string;
        s3UploadId: string;
    };

interface FinishDropPreparation {
    alreadyComplete: boolean;
    pendingFileIds: string[];
}

/**
 * Keep multipart reservation inserts below database bind-parameter limits.
 * A 250 GiB file has 5,120 rows; building one enormous createMany statement is
 * needlessly fragile and the enclosing parent transaction preserves atomicity.
 */
async function createUploadChunkReservations(
    tx: Prisma.TransactionClient,
    input: Pick<FileReservationInput, "fileId" | "chunkCount" | "chunkSize">,
): Promise<void> {
    for (let start = 0; start < input.chunkCount; start += UPLOAD_CHUNK_INSERT_BATCH_SIZE) {
        const batchSize = Math.min(UPLOAD_CHUNK_INSERT_BATCH_SIZE, input.chunkCount - start);
        await tx.uploadChunk.createMany({
            data: Array.from({ length: batchSize }, (_, offset) => ({
                fileId: input.fileId,
                chunkIndex: start + offset,
                size: BigInt(input.chunkSize),
                completed: false,
            })),
        });
    }
}

/**
 * Serialize the final authenticated DropFile insert against whole-drop
 * deletion. The quota update and DropFile/chunk inserts share this transaction,
 * so a crash or failed insert cannot leave charged bytes with no row to reclaim.
 */
async function createAuthenticatedFileReservation(
    input: AuthenticatedFileReservationInput,
): Promise<void> {
    await prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<LockedUploadDrop[]>`
            SELECT
                "id",
                "maxFileCount",
                "uploadComplete",
                "deletedAt",
                "userId",
                "organizationId"
            FROM "drops"
            WHERE "id" = ${input.dropId}
            FOR UPDATE
        `;
        const drop = rows[0];

        if (!drop || drop.deletedAt) throw new NotFoundError("Drop not found");
        if (drop.uploadComplete) throw new ValidationError("Drop upload already completed");
        if (
            drop.userId !== input.ownerUserId
            || drop.organizationId !== input.organizationId
        ) {
            throw new ForbiddenError("Access denied");
        }

        const [fileCount, pendingFiles, existingFiles] = await Promise.all([
            tx.dropFile.count({ where: { dropId: input.dropId } }),
            tx.dropFile.count({ where: { dropId: input.dropId, uploadComplete: false } }),
            input.dropPlaintextLimit === undefined
                ? Promise.resolve([])
                : tx.dropFile.findMany({
                    where: { dropId: input.dropId },
                    select: { size: true, chunkCount: true },
                }),
        ]);
        if (drop.maxFileCount !== null && fileCount >= drop.maxFileCount) {
            throw new ValidationError(`Drop already has maximum number of files (${drop.maxFileCount})`);
        }
        if (pendingFiles >= MAX_PENDING_FILES_PER_DROP) {
            throw new RateLimitError("Too many pending uploads for this drop");
        }
        if (input.dropPlaintextLimit !== undefined) {
            const existingPlaintextBytes = existingFiles.reduce(
                (sum, file) => sum + plaintextSizeFromEncrypted(Number(file.size), file.chunkCount ?? 1),
                0,
            );
            const nextPlaintextBytes = plaintextSizeFromEncrypted(input.size, input.chunkCount);
            if (existingPlaintextBytes + nextPlaintextBytes > input.dropPlaintextLimit) {
                throw input.dropSizeExceededError
                    ?? new ValidationError("Drop size limit exceeded");
            }
        }

        const reserved = await tx.$executeRaw`
            UPDATE "users"
            SET "storageUsed" = "storageUsed" + ${BigInt(input.size)}
            WHERE "id" = ${input.ownerUserId}
              AND "storageUsed" + ${BigInt(input.size)} <= ${input.storageLimit}
        `;
        if (reserved === 0) {
            throw input.quotaExceededError;
        }

        await tx.dropFile.create({
            data: {
                id: input.fileId,
                dropId: input.dropId,
                storageKey: input.storageKey,
                s3UploadId: input.s3UploadId,
                encryptedName: input.encryptedName,
                iv: input.iv,
                size: BigInt(input.size),
                mimeType: input.mimeType,
                chunkCount: input.chunkCount,
                chunkSize: input.chunkSize,
                uploadComplete: false,
            },
        });

        await createUploadChunkReservations(tx, input);
    }, { isolationLevel: "ReadCommitted" });
}

/**
 * Atomically reserve a file slot and bytes for a guest drop.
 *
 * Guest drops have no owner quota row that can be incremented conditionally, so
 * concurrent upload-token requests are serialized on the parent drop row. The
 * aggregate runs only after the row lock is acquired, giving each transaction a
 * fresh READ COMMITTED view of reservations made by the previous request.
 */
async function createGuestFileReservation(input: FileReservationInput): Promise<void> {
    await prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<LockedUploadDrop[]>`
            SELECT
                "id",
                "maxFileCount",
                "uploadComplete",
                "deletedAt",
                "userId",
                "organizationId"
            FROM "drops"
            WHERE "id" = ${input.dropId}
            FOR UPDATE
        `;
        const drop = rows[0];

        if (!drop || drop.deletedAt) {
            throw new NotFoundError("Drop not found");
        }
        if (drop.uploadComplete) {
            throw new ValidationError("Drop upload already completed");
        }
        if (drop.userId !== null || drop.organizationId !== null) {
            throw new ForbiddenError("Access denied");
        }

        const usage = await tx.dropFile.aggregate({
            where: { dropId: input.dropId },
            _count: { _all: true },
            _sum: { size: true },
        });
        const fileCount = usage._count._all;
        const existingBytes = usage._sum.size ?? BigInt(0);
        const maxFileCount = Math.min(
            drop.maxFileCount ?? GUEST_MAX_FILES_PER_DROP,
            GUEST_MAX_FILES_PER_DROP,
        );

        if (fileCount >= maxFileCount) {
            throw new ValidationError(`Drop already has maximum number of files (${maxFileCount})`);
        }

        const requestedBytes = existingBytes + BigInt(input.size);
        if (requestedBytes > GUEST_ENCRYPTED_STORAGE_LIMIT) {
            throw new UpgradeRequiredError(
                "Guest drops are limited to 100MB total.",
                {
                    scope: "drop_bandwidth",
                    currentTier: "guest",
                    suggestedTier: "plus",
                    currentValue: Number(requestedBytes),
                    limitValue: GUEST_MAX_DROP_BYTES,
                }
            );
        }

        await tx.dropFile.create({
            data: {
                id: input.fileId,
                dropId: input.dropId,
                storageKey: input.storageKey,
                s3UploadId: input.s3UploadId,
                encryptedName: input.encryptedName,
                iv: input.iv,
                size: BigInt(input.size),
                mimeType: input.mimeType,
                chunkCount: input.chunkCount,
                chunkSize: input.chunkSize,
                uploadComplete: false,
            },
        });

        await createUploadChunkReservations(tx, input);
    }, { isolationLevel: "ReadCommitted" });
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

export interface RecipientInput {
    email: string;
    label?: string | null;
    maxDownloads?: number | null;
    expiresAt?: Date | null;
}

export interface CreatedRecipient {
    id: string;
    email: string;
    label: string | null;
    /** Raw access token — returned ONCE so the client can build the share link. */
    token: string;
}

export interface RecipientListItem {
    id: string;
    email: string;
    label: string | null;
    maxDownloads: number | null;
    downloads: number;
    expiresAt: Date | null;
    revokedAt: Date | null;
    lastAccessAt: Date | null;
    createdAt: Date;
}

export interface AccessEventItem {
    id: string;
    eventType: string;
    fileId: string | null;
    createdAt: Date;
    recipientEmail: string | null;
    recipientLabel: string | null;
}

export class DropService {
    /**
     * Verify that the caller owns the drop (authenticated user match).
     */
    private static verifyDropOwnership(
        drop: { userId: string | null; organizationId: string | null; id: string },
        scope: OwnerScope
    ): void {
        if (!isWithinScope(drop, scope)) {
            throw new ForbiddenError("Unauthorized");
        }
    }

    /**
     * Verify access for either an authenticated user or a guest (token-bound).
     * Route layer has already verified the upload token before calling this;
     * here we only assert that the drop and caller mode agree.
     */
    private static verifyDropAccess(
        drop: { userId: string | null; organizationId: string | null; id: string },
        scope: OwnerScope | null
    ): void {
        if (scope) {
            if (!isWithinScope(drop, scope)) throw new ForbiddenError("Unauthorized");
            return;
        }
        // Guest: the drop must be unowned (no user, no org).
        if (drop.userId !== null || drop.organizationId !== null) throw new ForbiddenError("Unauthorized");
    }

    /**
     * Delete files from storage and atomically reclaim the drop's quota.
     * Failed object deletions are tracked as system orphans; once the user has
     * deleted the drop, those inaccessible bytes no longer consume their quota.
     */
    private static async deleteFilesAndReclaimQuota(
        dropId: string,
    ): Promise<void> {
        // Mark the parent and claim its rows before touching storage. A losing
        // concurrent deleter receives no files and therefore cannot race an R2
        // delete against a pending completion.
        const claim = await deleteDropFilesAndReleaseQuota(dropId);
        const files = claim.files;
        let failedKeys: string[] = [];

        if (files.length > 0) {
            for (const file of files) {
                if (!file.s3UploadId) continue;
                try {
                    await abortMultipartUpload(file.storageKey, file.s3UploadId);
                } catch {
                    // It may already be completed or aborted; object deletion below
                    // is the authoritative cleanup for completed uploads.
                }
            }

            const keys = files.map(f => f.storageKey);
            try {
                failedKeys = await deleteObjects(keys);
            } catch (e) {
                logger.error("Batch delete failed, falling back to per-file deletion", e);
                for (const file of files) {
                    try {
                        await deleteObject(file.storageKey);
                    } catch (fileErr) {
                        logger.error(`Failed to delete file from storage`, fileErr, { storageKey: file.storageKey });
                        failedKeys.push(file.storageKey);
                    }
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

    }

    /**
     * Create a new drop (collection for grouping files).
     * When userId is null the caller is a guest: a hardcoded guest limits
     * profile is applied (100MB per file, 1-day expiry, fileCount cap), and
     * no vault-backed owner key is persisted.
     */
    static async createDrop(
        scope: OwnerScope | null,
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

        if (scope) {
            let { limits, tier } = await getUserAndLimits(scope.userId);
            // Org drops: feature/expiry limits derive from the org's own plan.
            if (scope.organizationId) {
                const orgCtx = await getOrgLimitContext(scope.organizationId);
                // Purchase-first Teams: an unsubscribed org is a zero-capacity workspace.
                assertOrgPlanActive(orgCtx, "drops", "drop_file_size");
                limits = getDropLimits(orgCtx);
                tier = getEffectiveTier(orgCtx);
            }
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
                userId: scope?.userId ?? null,
                organizationId: scope?.organizationId ?? null,
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
        scope: OwnerScope | null,
        input: AddFileInput,
        options: AddFileOptions = {}
    ): Promise<AddFileResult> {
        const plaintextSize = plaintextSizeFromEncrypted(input.size, input.chunkCount);
        if (!Number.isSafeInteger(plaintextSize) || plaintextSize <= 0) {
            throw new ValidationError("Invalid encrypted file size");
        }

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

        // Count pending files for this drop
        const pendingFiles = await prisma.dropFile.count({
            where: { dropId: input.dropId, uploadComplete: false }
        });
        if (pendingFiles >= MAX_PENDING_FILES_PER_DROP) {
            throw new RateLimitError("Too many pending uploads for this drop");
        }

        // Per-user incomplete-drop guard only applies to authenticated drops;
        // guests are guarded by IP rate limits at the route layer.
        if (scope) {
            const incompleteDrops = await prisma.drop.count({
                where: { userId: scope.userId, uploadComplete: false, deletedAt: null }
            });
            if (incompleteDrops >= MAX_INCOMPLETE_DROPS_PER_USER) {
                throw new RateLimitError("Too many incomplete drops. Please complete or delete existing drops.");
            }
        }

        // Verify caller mode matches drop ownership
        DropService.verifyDropAccess(drop, scope);
        const quotaUserId = scope ? drop.userId : null;
        if (scope && !quotaUserId) {
            throw new ForbiddenError("This drop no longer has a storage owner");
        }
        let authenticatedQuota: Pick<
            AuthenticatedFileReservationInput,
            "storageLimit" | "quotaExceededError" | "dropPlaintextLimit" | "dropSizeExceededError"
        > | null = null;

        if (scope) {
            // Authenticated path: validate against plan limits and reserve
            // storage atomically to prevent TOCTOU. In org scope the file-size /
            // storage-ceiling limits derive from the org's own plan.
            //
            // TODO(track-c) — org-pooled storage (own change, needs a migration):
            // org-owned drops currently meter against the creating member's
            // `users.storageUsed`. Reserve and reclaim are internally consistent
            // (both hit that user counter), so there's no drift — but usage is
            // per-member, not pooled across the org, and a member's personal usage
            // is checked against the ORG limit. To pool it:
            //   1. Add Organization.storageUsed BigInt @default(0) (+ migration).
            //   2. Here: in org scope, reserve against the org counter
            //      (atomic UPDATE on `organizations`), not the user.
            //   3. Route EVERY reclaim path to the org counter for org-owned
            //      drops: deleteFilesAndReclaimQuota / drop-storage.ts, the four
            //      drop-cleanup.ts sites, admin.ts takedown, and the
            //      billing-downgrade.ts reconciliation (which sums per user).
            //   4. Add pooling + concurrency/drift tests across those paths.
            // Missing any reclaim path leaks the org counter, so do it as one
            // coordinated change.
            // Org members may collaborate on the same drop, but until org-pooled
            // storage exists every file must be charged to Drop.userId (the
            // creator). Reclaim derives that same owner from the parent row.
            const userLimits = await getUserAndLimits(quotaUserId!);
            const storageUsed = userLimits.storageUsed;
            let limits = userLimits.limits;
            let tier = userLimits.tier;
            if (scope.organizationId) {
                const orgCtx = await getOrgLimitContext(scope.organizationId);
                limits = getDropLimits(orgCtx);
                tier = getEffectiveTier(orgCtx);
            }
            const plaintextStorageLimit = options.quotaOverride?.storageLimit ?? BigInt(limits.maxStorage);
            const storageLimit = encryptedStorageLimit(plaintextStorageLimit, MAX_PENDING_FILES_PER_DROP);

            if (options.quotaOverride) {
                if (plaintextSize > options.quotaOverride.maxFileSize) {
                    throw new UpgradeRequiredError(
                        "Attachment size exceeds this form's file upload limit.",
                        {
                            scope: "form_file_uploads",
                            currentTier: options.quotaOverride.currentTier,
                            suggestedTier: options.quotaOverride.currentTier === "pro"
                                ? "pro"
                                : options.quotaOverride.currentTier === "plus"
                                  ? "pro"
                                  : "plus",
                            currentValue: plaintextSize,
                            limitValue: options.quotaOverride.maxFileSize,
                        }
                    );
                }
                if (storageUsed + BigInt(input.size) > storageLimit) {
                    throw new UpgradeRequiredError(
                        "Attachment storage limit reached for this form plan.",
                        {
                            scope: "form_file_uploads",
                            currentTier: options.quotaOverride.currentTier,
                            suggestedTier: options.quotaOverride.currentTier === "pro"
                                ? "pro"
                                : options.quotaOverride.currentTier === "plus"
                                  ? "pro"
                                  : "plus",
                            currentValue: Number(storageUsed + BigInt(input.size)),
                            limitValue: Number(plaintextStorageLimit),
                        }
                    );
                }
            } else {
                validateFileSize(
                    input.size,
                    storageUsed,
                    storageLimit,
                    limits.maxFileSize,
                    tier,
                    plaintextSize,
                );
            }

            authenticatedQuota = {
                storageLimit,
                ...(options.quotaOverride
                    ? {
                        dropPlaintextLimit: options.quotaOverride.maxFileSize,
                        dropSizeExceededError: new UpgradeRequiredError(
                            "Attachment size exceeds this form's file upload limit.",
                            {
                                scope: "form_file_uploads",
                                currentTier: options.quotaOverride.currentTier,
                                suggestedTier: options.quotaOverride.currentTier === "pro"
                                    ? "pro"
                                    : options.quotaOverride.currentTier === "plus"
                                      ? "pro"
                                      : "plus",
                                currentValue: plaintextSize,
                                limitValue: options.quotaOverride.maxFileSize,
                            },
                        ),
                    }
                    : {}),
                quotaExceededError: options.quotaOverride
                    ? new UpgradeRequiredError(
                        "Attachment storage limit reached for this form plan.",
                        {
                            scope: "form_file_uploads",
                            currentTier: options.quotaOverride.currentTier,
                            suggestedTier: options.quotaOverride.currentTier === "pro"
                                ? "pro"
                                : options.quotaOverride.currentTier === "plus"
                                  ? "pro"
                                  : "plus",
                            currentValue: Number(storageUsed + BigInt(input.size)),
                            limitValue: Number(plaintextStorageLimit),
                        }
                    )
                    : new UpgradeRequiredError(
                        "Bandwidth limit reached. Upgrade for more headroom.",
                        {
                            scope: "drop_bandwidth",
                            currentTier: tier,
                            suggestedTier: tier === "pro" ? "pro" : tier === "plus" ? "pro" : "plus",
                            currentValue: Number(storageUsed + BigInt(input.size)),
                            limitValue: Number(plaintextStorageLimit),
                        }
                    ),
            };
        } else {
            // Guest path: enforce per-file and per-drop caps inline. No user
            // storageUsed reservation because there is no user row.
            if (plaintextSize > GUEST_MAX_DROP_BYTES) {
                throw new UpgradeRequiredError(
                    `File size exceeds guest limit of ${GUEST_MAX_DROP_BYTES / (1024 * 1024)}MB. Sign up for a larger quota.`,
                    {
                        scope: "drop_file_size",
                        currentTier: "guest",
                        suggestedTier: "plus",
                        currentValue: plaintextSize,
                        limitValue: GUEST_MAX_DROP_BYTES,
                    }
                );
            }

            const existing = await prisma.dropFile.aggregate({
                where: { dropId: input.dropId },
                _sum: { size: true },
            });
            const existingBytes = existing._sum.size ?? BigInt(0);
            if (existingBytes + BigInt(input.size) > GUEST_ENCRYPTED_STORAGE_LIMIT) {
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

        // Initiate storage first, then atomically reserve quota and create all DB
        // rows under the parent lock. If the transaction fails, only the
        // multipart upload needs compensation.
        const fileId = generateFileId();
        const storageKey = generateStorageKey(fileId);

        let s3UploadId: string | null = null;
        try {
            s3UploadId = await initiateMultipartUpload(storageKey, "application/octet-stream");

            if (scope) {
                await createAuthenticatedFileReservation({
                    ...input,
                    fileId,
                    storageKey,
                    s3UploadId,
                    ownerUserId: quotaUserId!,
                    organizationId: drop.organizationId,
                    ...authenticatedQuota!,
                });
            } else {
                // Re-check and reserve guest caps while holding the parent row
                // lock. The earlier count/aggregate checks are only fast-path
                // feedback and are not trusted for concurrency enforcement.
                await createGuestFileReservation({
                    ...input,
                    fileId,
                    storageKey,
                    s3UploadId,
                });
            }
        } catch (err) {
            logger.error("addFile setup failed, compensating", err, { dropId: input.dropId, fileId });
            if (s3UploadId) {
                await abortMultipartUpload(storageKey, s3UploadId).catch((e) =>
                    logger.error("Compensation: failed to abort multipart upload", e, { fileId, storageKey })
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
     * Roll back a provisioned file when the caller cannot receive its upload
     * URLs (for example, one of thousands of signing operations fails). The
     * DELETE CTE makes quota release idempotent if another cleanup races us.
     */
    static async rollbackProvisionedFile(file: {
        fileId: string;
        s3UploadId: string;
        storageKey: string;
    }): Promise<void> {
        await abortMultipartUpload(file.storageKey, file.s3UploadId).catch((error) =>
            logger.error("Failed to abort multipart upload after URL signing failure", error, {
                fileId: file.fileId,
                storageKey: file.storageKey,
            })
        );

        await deleteDropFileAndReleaseQuota(file.fileId).catch((error) =>
            logger.error("Failed to release file reservation after URL signing failure", error, {
                fileId: file.fileId,
                storageKey: file.storageKey,
            })
        );
    }

    /**
     * Complete a file upload (finalize multipart upload).
     * When skipAuth is true, ownership verification is skipped (used by finishDrop
     * which already verified ownership up front).
     */
    static async completeFileUpload(
        fileId: string,
        scope: OwnerScope | null,
        skipAuth = false
    ): Promise<void> {
        const result = await prisma.$transaction<FileFinalizationResult>(async (tx) => {
            // This database lock is the finalization mutex across every process
            // and instance. A retry waits here, then observes uploadComplete and
            // returns without repeating R2 completion or quota mutation.
            const rows = await tx.$queryRaw<LockedFinalizationFile[]>`
                SELECT
                    file."id",
                    file."size" AS "declaredSize",
                    file."storageKey",
                    file."s3UploadId",
                    file."uploadComplete",
                    file."dropId",
                    parent."userId" AS "ownerUserId",
                    parent."organizationId",
                    parent."deletedAt" AS "dropDeletedAt"
                FROM "drop_files" AS file
                INNER JOIN "drops" AS parent ON parent."id" = file."dropId"
                WHERE file."id" = ${fileId}
                FOR UPDATE OF file
            `;
            const file = rows[0];

            if (!file) throw new NotFoundError("File not found");
            if (file.dropDeletedAt) throw new NotFoundError("Drop has been deleted");
            if (!skipAuth) {
                DropService.verifyDropAccess({
                    id: file.dropId,
                    userId: file.ownerUserId,
                    organizationId: file.organizationId,
                }, scope);
            }
            if (file.uploadComplete) return { status: "already_complete" };
            if (!file.s3UploadId) throw new ValidationError("Multipart upload is not initialized");

            const chunks = await tx.uploadChunk.findMany({
                where: { fileId },
                orderBy: { chunkIndex: "asc" },
                select: { chunkIndex: true, etag: true, completed: true },
            });
            const incompleteChunks = chunks.filter((chunk) => !chunk.completed || !chunk.etag);
            if (incompleteChunks.length > 0) {
                throw new ValidationError(`${incompleteChunks.length} chunks not yet uploaded`);
            }

            const parts = chunks.map((chunk) => ({
                PartNumber: chunk.chunkIndex + 1,
                ETag: chunk.etag!,
            }));

            // CompleteMultipartUpload can commit at R2 and still fail at the
            // network boundary. Always reconcile with HEAD before deciding the
            // outcome; a valid object turns that ambiguous error into success.
            let completionError: unknown = null;
            try {
                await completeMultipartUpload(file.storageKey, file.s3UploadId, parts);
            } catch (error) {
                completionError = error;
            }

            let metadata: Awaited<ReturnType<typeof getObjectMetadata>>;
            try {
                metadata = await getObjectMetadata(file.storageKey);
            } catch (headError) {
                // The transaction rolls back, preserving the row and declared
                // reservation. A later retry can reconcile the completed object.
                throw completionError ?? headError;
            }
            if (!metadata) {
                throw completionError ?? new ServiceUnavailableError("Unable to verify uploaded file size");
            }
            if (!Number.isSafeInteger(metadata.contentLength) || metadata.contentLength < 0) {
                throw new ServiceUnavailableError("Storage returned invalid object metadata");
            }

            const actualSize = BigInt(metadata.contentLength);
            const minExpectedSize = file.declaredSize * BigInt(9) / BigInt(10);
            let invalidSizeMessage: string | null = null;
            if (actualSize > file.declaredSize) {
                invalidSizeMessage = "File size mismatch: uploaded more than declared";
            } else if (
                actualSize <= BigInt(0) ||
                (actualSize < minExpectedSize && file.declaredSize > BigInt(1024))
            ) {
                invalidSizeMessage = "File size mismatch: uploaded significantly less than declared";
            }

            if (invalidSizeMessage) {
                // Definite validation failures are claimed while holding the row
                // lock. Row deletion and declared-byte quota release commit as
                // one unit; storage cleanup happens only after that commit.
                await tx.dropFile.delete({ where: { id: fileId } });
                if (file.ownerUserId) {
                    await tx.$executeRaw`
                        UPDATE "users"
                        SET "storageUsed" = GREATEST(0::bigint, "storageUsed" - ${file.declaredSize})
                        WHERE "id" = ${file.ownerUserId}
                    `;
                }
                return {
                    status: "invalid_size",
                    message: invalidSizeMessage,
                    storageKey: file.storageKey,
                    s3UploadId: file.s3UploadId,
                };
            }

            await tx.dropFile.update({
                where: { id: fileId },
                data: { uploadComplete: true, size: actualSize },
            });

            // Correct the exact creator reservation in the same transaction as
            // uploadComplete. This runs once because every retry is serialized
            // by the DropFile lock and exits above once completion is visible.
            if (file.ownerUserId && actualSize < file.declaredSize) {
                const difference = file.declaredSize - actualSize;
                await tx.$executeRaw`
                    UPDATE "users"
                    SET "storageUsed" = GREATEST(0::bigint, "storageUsed" - ${difference})
                    WHERE "id" = ${file.ownerUserId}
                `;
            }

            return { status: "completed" };
        }, {
            isolationLevel: "ReadCommitted",
            maxWait: FILE_FINALIZATION_TRANSACTION_MAX_WAIT_MS,
            timeout: FILE_FINALIZATION_TRANSACTION_TIMEOUT_MS,
        });

        if (result.status !== "invalid_size") return;

        // The row/quota claim is committed. R2 cleanup is deliberately outside
        // the transaction so storage latency cannot roll back that decision.
        await abortMultipartUpload(result.storageKey, result.s3UploadId).catch(() => undefined);
        try {
            await deleteObject(result.storageKey);
        } catch (deleteError) {
            logger.error("Failed to delete invalid upload, recording for cron retry", deleteError, {
                fileId,
                storageKey: result.storageKey,
            });
            try {
                await prisma.orphanedFile.create({ data: { storageKey: result.storageKey } });
            } catch (orphanError) {
                logger.error("Failed to record invalid upload as orphaned", orphanError, {
                    fileId,
                    storageKey: result.storageKey,
                });
            }
        }

        throw new ValidationError(result.message);
    }

    /**
     * Complete a drop (mark all files as uploaded).
     * When skipAuth is true, ownership verification is skipped (used by finishDrop
     * which already verified ownership up front).
     */
    static async completeDrop(
        dropId: string,
        scope: OwnerScope | null,
        skipAuth = false
    ): Promise<void> {
        // Serialize completion with addFile's reservation transaction on the
        // parent row. Without this lock, completion could read an all-complete
        // file list, a concurrent add could insert a pending file, and the drop
        // could then be marked complete while still containing that file.
        await prisma.$transaction(async (tx) => {
            const rows = await tx.$queryRaw<LockedUploadDrop[]>`
                SELECT
                    "id",
                    "maxFileCount",
                    "uploadComplete",
                    "deletedAt",
                    "userId",
                    "organizationId"
                FROM "drops"
                WHERE "id" = ${dropId}
                FOR UPDATE
            `;
            const drop = rows[0];

            if (!drop) {
                throw new NotFoundError("Drop not found");
            }
            if (drop.deletedAt) {
                throw new NotFoundError("Drop has been deleted");
            }
            if (!skipAuth) {
                DropService.verifyDropAccess(drop, scope);
            }
            if (drop.uploadComplete) return;

            const files = await tx.dropFile.findMany({
                where: { dropId },
                select: { id: true, uploadComplete: true },
            });
            const incompleteFiles = files.filter((file) => !file.uploadComplete);
            if (incompleteFiles.length > 0) {
                throw new ValidationError(`${incompleteFiles.length} files not yet uploaded`);
            }
            if (files.length === 0) {
                throw new ValidationError("Drop has no files");
            }

            await tx.drop.update({
                where: { id: dropId },
                data: { uploadComplete: true },
            });
        }, { isolationLevel: "ReadCommitted" });
    }

    /**
     * Batch finalize a drop: record all chunks, complete all files, complete the drop.
     * Reusable by server actions and API routes.
     * Verifies ownership once up front, then skips auth in the per-file/per-drop calls.
     */
    static async finishDrop(
        dropId: string,
        files: { fileId: string; chunks: { chunkIndex: number; etag: string }[] }[],
        scope: OwnerScope | null
    ): Promise<void> {
        const preparation = await prisma.$transaction<FinishDropPreparation>(async (tx) => {
            // Share the parent lock with addFile/completeDrop so the exact file
            // manifest is validated against a stable set before any ETag write.
            const rows = await tx.$queryRaw<LockedUploadDrop[]>`
                SELECT
                    "id",
                    "maxFileCount",
                    "uploadComplete",
                    "deletedAt",
                    "userId",
                    "organizationId"
                FROM "drops"
                WHERE "id" = ${dropId}
                FOR UPDATE
            `;
            const drop = rows[0];
            if (!drop) throw new NotFoundError("Drop not found");
            if (drop.deletedAt) throw new NotFoundError("Drop has been deleted");
            DropService.verifyDropAccess(drop, scope);
            if (drop.uploadComplete) {
                return { alreadyComplete: true, pendingFileIds: [] };
            }

            const storedFiles = await tx.dropFile.findMany({
                where: { dropId },
                select: { id: true, chunkCount: true, uploadComplete: true },
            });
            if (storedFiles.length === 0 || files.length !== storedFiles.length) {
                throw new ValidationError("File manifest does not match drop");
            }

            const requestedFiles = new Map<string, typeof files[number]>();
            for (const file of files) {
                if (requestedFiles.has(file.fileId)) {
                    throw new ValidationError("Duplicate file in finish request");
                }
                requestedFiles.set(file.fileId, file);
            }
            if (storedFiles.some((file) => !requestedFiles.has(file.id))) {
                throw new ValidationError("File manifest does not match drop");
            }

            const storedChunks = await tx.uploadChunk.findMany({
                where: { fileId: { in: storedFiles.map((file) => file.id) } },
                select: {
                    fileId: true,
                    chunkIndex: true,
                    completed: true,
                    etag: true,
                },
            });
            const chunksByKey = new Map(
                storedChunks.map((chunk) => [`${chunk.fileId}:${chunk.chunkIndex}`, chunk]),
            );
            const expectedStoredChunks = storedFiles.reduce(
                (total, file) => total + (file.chunkCount ?? 0),
                0,
            );
            if (storedChunks.length !== expectedStoredChunks) {
                throw new ValidationError("Chunk manifest does not match uploaded file");
            }

            const chunkCompletions: { fileId: string; chunkIndex: number; etag: string }[] = [];
            for (const storedFile of storedFiles) {
                const requestedFile = requestedFiles.get(storedFile.id)!;
                const expectedChunkCount = storedFile.chunkCount;
                if (!expectedChunkCount || requestedFile.chunks.length !== expectedChunkCount) {
                    throw new ValidationError("Chunk manifest does not match uploaded file");
                }

                const seenChunkIndexes = new Set<number>();
                for (const chunk of requestedFile.chunks) {
                    if (
                        chunk.chunkIndex < 0 ||
                        chunk.chunkIndex >= expectedChunkCount ||
                        seenChunkIndexes.has(chunk.chunkIndex) ||
                        chunk.etag.length === 0 ||
                        chunk.etag.length > 256
                    ) {
                        throw new ValidationError("Chunk manifest does not match uploaded file");
                    }
                    seenChunkIndexes.add(chunk.chunkIndex);

                    const storedChunk = chunksByKey.get(`${storedFile.id}:${chunk.chunkIndex}`);
                    if (!storedChunk) {
                        throw new ValidationError("Chunk manifest does not match uploaded file");
                    }
                    if (storedChunk.completed) {
                        if (storedChunk.etag !== chunk.etag) {
                            throw new ValidationError("Completed chunk ETag cannot be changed");
                        }
                    } else {
                        if (storedFile.uploadComplete) {
                            throw new ValidationError("Completed file contains an incomplete chunk");
                        }
                        chunkCompletions.push({
                            fileId: storedFile.id,
                            chunkIndex: chunk.chunkIndex,
                            etag: chunk.etag,
                        });
                    }
                }
            }

            // Compare-and-set makes concurrent retries idempotent. If another
            // transaction completed a chunk with the same ETag, the no-op update
            // is accepted; a different ETag no longer matches and aborts all
            // writes in this transaction.
            for (let start = 0; start < chunkCompletions.length; start += CHUNK_FINALIZATION_BATCH_SIZE) {
                const batch = chunkCompletions.slice(start, start + CHUNK_FINALIZATION_BATCH_SIZE);
                const updated = await tx.$executeRaw`
                    UPDATE "upload_chunks" AS chunk
                    SET
                        "completed" = TRUE,
                        "etag" = incoming."etag",
                        "updatedAt" = CURRENT_TIMESTAMP
                    FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb)
                        AS incoming("fileId" text, "chunkIndex" integer, "etag" text)
                    WHERE chunk."fileId" = incoming."fileId"
                      AND chunk."chunkIndex" = incoming."chunkIndex"
                      AND (
                          chunk."completed" = FALSE
                          OR chunk."etag" = incoming."etag"
                      )
                `;
                if (updated !== batch.length) {
                    throw new ValidationError("Completed chunk ETag cannot be changed");
                }
            }

            return {
                alreadyComplete: false,
                pendingFileIds: storedFiles
                    .filter((file) => !file.uploadComplete)
                    .map((file) => file.id),
            };
        }, { isolationLevel: "ReadCommitted" });

        if (preparation.alreadyComplete) return;

        await pMapLimit(preparation.pendingFileIds, FILE_COMPLETION_CONCURRENCY, async (fileId) => {
            await this.completeFileUpload(fileId, scope, true);
        });
        await this.completeDrop(dropId, scope, true);
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
                uploadTokens: {
                    where: { formId: { not: null } },
                    select: { id: true },
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

        // A completed upload is still private staging until recordSubmission
        // atomically consumes its form-bound token and creates the submission.
        if (drop.formStagingId || drop.uploadTokens.length > 0) {
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
     * Atomically consume a download against the drop-wide limit and, when
     * present, a named recipient's independent limit. Both guarded updates run
     * in one database transaction so neither allowance can be spent alone.
     *
     * Availability is revalidated by the UPDATE itself. This closes the race
     * between the public metadata lookup and URL issuance when a drop expires,
     * is disabled/taken down, or reaches its global limit concurrently.
     */
    static async consumeDownload(
        dropId: string,
        recipientId: string | null = null,
    ): Promise<boolean> {
        let consumed: boolean;

        try {
            consumed = await prisma.$transaction(async (tx) => {
                // Lock/update the parent first. Keeping a stable parent-before-child
                // order also reduces deadlock risk with drop deletion operations.
                const dropRowsAffected = await tx.$executeRaw`
                    UPDATE "drops"
                    SET "downloads" = "downloads" + 1, "viewedAt" = NOW()
                    WHERE "id" = ${dropId}
                      AND "deletedAt" IS NULL
                      AND "disabled" = FALSE
                      AND "takenDown" = FALSE
                      AND "uploadComplete" = TRUE
                      AND "form_staging_id" IS NULL
                      AND NOT EXISTS (
                          SELECT 1
                          FROM "upload_tokens" AS token
                          WHERE token."dropId" = "drops"."id"
                            AND token."formId" IS NOT NULL
                      )
                      AND ("restrictToRecipients" = FALSE OR ${recipientId !== null})
                      AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
                      AND ("maxDownloads" IS NULL OR "downloads" < "maxDownloads")
                `;

                if (dropRowsAffected === 0) {
                    return false;
                }

                if (recipientId) {
                    const recipientRowsAffected = await tx.$executeRaw`
                        UPDATE "drop_recipients"
                        SET "downloads" = "downloads" + 1, "lastAccessAt" = NOW()
                        WHERE "id" = ${recipientId}
                          AND "dropId" = ${dropId}
                          AND "revokedAt" IS NULL
                          AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
                          AND ("maxDownloads" IS NULL OR "downloads" < "maxDownloads")
                    `;

                    if (recipientRowsAffected === 0) {
                        // Throw rather than return false: the drop row was already
                        // incremented and must be rolled back with this transaction.
                        throw new DownloadAccessDeniedError();
                    }
                }

                return true;
            });
        } catch (error) {
            if (error instanceof DownloadAccessDeniedError) {
                return false;
            }
            throw error;
        }

        if (!consumed) {
            return false;
        }

        // The allowance is committed. Notification/soft-delete work must not
        // turn a successfully authorized, already-counted download into an error.
        try {
            await this.handleCommittedDownload(dropId);
        } catch (error) {
            logger.error("Failed to process committed download side effects", error, { dropId });
        }

        return true;
    }

    /** Backward-compatible anonymous/global counter entry point. */
    static async incrementDownloadCount(dropId: string): Promise<boolean> {
        return this.consumeDownload(dropId);
    }

    /** Send owner notifications and schedule cleanup after a committed count. */
    private static async handleCommittedDownload(dropId: string): Promise<void> {
        // Fetch fresh drop data for notifications and limit check.
        const drop = await prisma.drop.findUnique({
            where: { id: dropId },
            include: {
                user: { select: { id: true, email: true, name: true } },
                files: { select: { id: true, storageKey: true, size: true } },
            },
        });

        if (!drop) return;

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
    static async toggleDrop(dropId: string, scope: OwnerScope): Promise<boolean> {
        const drop = await prisma.drop.findUnique({
            where: { id: dropId },
        });

        if (!drop) {
            throw new NotFoundError("Drop not found");
        }

        // Disabling a shared org drop affects the whole team → admin+ in org context.
        assertCanManage(drop, scope);

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
    static async deleteDrop(dropId: string, scope: OwnerScope): Promise<void> {
        const drop = await prisma.drop.findUnique({
            where: { id: dropId },
            select: { id: true, userId: true, organizationId: true },
        });

        if (!drop) {
            throw new NotFoundError("Drop not found");
        }

        // Deleting a shared org drop is destructive for the team → admin+ in org context.
        assertCanManage(drop, scope);

        // Reclaim storage from the user originally charged (the creator). This
        // pairs with the reservation in createDrop — see the track-c spec there:
        // when storage becomes org-pooled, this reclaim must target the org
        // counter for org-owned drops (drop.organizationId) instead of the user.
        await DropService.deleteFilesAndReclaimQuota(dropId);

        await prisma.drop.deleteMany({ where: { id: dropId } });
    }

    /**
     * List drops for a user
     */
    static async listDrops(
        scope: OwnerScope,
        options: { limit?: number; offset?: number } = {}
    ): Promise<{ drops: DropListItem[]; total: number }> {
        const { limit = 50, offset = 0 } = options;

        const drops = await prisma.drop.findMany({
            where: {
                ...ownerWhere(scope),
                deletedAt: null,
                // Form attachments are managed from their response, not as
                // standalone shares. Hide both staging and submitted drops.
                formSubmission: null,
                formStagingId: null,
                uploadTokens: { none: { formId: { not: null } } },
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
            where: {
                ...ownerWhere(scope),
                deletedAt: null,
                formSubmission: null,
                formStagingId: null,
                uploadTokens: { none: { formId: { not: null } } },
            },
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

    // ─── Recipients & access log ────────────────────────────────────────────

    /**
     * Resolve the drop feature flags + effective tier for a scope (personal or
     * org). Read-style: it does NOT ban-check, so a downgraded/limited owner can
     * still view and revoke recipients they created.
     */
    private static async resolveDropFeatures(
        scope: OwnerScope,
    ): Promise<{ features: (typeof DROP_FEATURES)[keyof typeof DROP_FEATURES]; tier: "free" | "plus" | "pro" }> {
        if (scope.organizationId) {
            const orgCtx = await getOrgLimitContext(scope.organizationId);
            return { features: getDropLimits(orgCtx).features, tier: getEffectiveTier(orgCtx) };
        }
        const user = await prisma.user.findUnique({
            where: { id: scope.userId },
            select: {
                referralPlusUntil: true,
                subscriptions: {
                    where: { status: { in: ["active", "trialing"] } },
                    select: { status: true, product: true, tier: true, currentPeriodEnd: true },
                },
            },
        });
        return { features: getDropLimits(user).features, tier: getEffectiveTier(user) };
    }

    /**
     * Add named recipients to a drop. Each gets a unique, revocable access token
     * (returned once as `token`) so the CLIENT can assemble the share link with the
     * decryption key in the fragment — the server never sees the key. Requires the
     * recipientControls entitlement (Plus+). Adding to a shared org drop is admin+.
     */
    static async addRecipients(
        scope: OwnerScope,
        dropId: string,
        inputs: RecipientInput[],
        options: { restrict?: boolean; notify?: boolean } = {},
    ): Promise<CreatedRecipient[]> {
        const drop = await prisma.drop.findUnique({ where: { id: dropId } });
        if (!drop) throw new NotFoundError("Drop not found");
        assertCanManage(drop, scope);

        const { features, tier } = await this.resolveDropFeatures(scope);
        if (!features.recipientControls) {
            throw new UpgradeRequiredError(
                "Adding named recipients requires a Plus or Pro plan.",
                { scope: "drop_file_size", currentTier: tier, suggestedTier: "plus" },
            );
        }

        // Toggle "only named recipients can download" when requested.
        if (options.restrict !== undefined && options.restrict !== drop.restrictToRecipients) {
            await prisma.drop.update({
                where: { id: dropId },
                data: { restrictToRecipients: options.restrict },
            });
        }

        if (inputs.length === 0) return [];

        const prepared = inputs.map((input) => ({ input, ...generateRecipientToken() }));

        const created = await prisma.$transaction(
            prepared.map(({ input, tokenHash }) =>
                prisma.dropRecipient.create({
                    data: {
                        dropId,
                        email: input.email,
                        label: input.label ?? null,
                        tokenHash,
                        maxDownloads: input.maxDownloads ?? null,
                        expiresAt: input.expiresAt ?? null,
                    },
                    select: { id: true, email: true, label: true },
                }),
            ),
        );

        const result = created.map((row, i) => ({
            id: row.id,
            email: row.email,
            label: row.label,
            token: prepared[i]!.raw,
        }));

        // Optional keyless email notification. Keep the access token in `?r=`
        // for compatibility with email-security link rewriters; the download
        // page scrubs it from browser history immediately. The decryption key
        // is never included, so anon.li stays zero-knowledge.
        if (options.notify) {
            try {
                const [{ sendDropSharedEmail }, sender] = await Promise.all([
                    import("@/lib/resend"),
                    prisma.user.findUnique({ where: { id: scope.userId }, select: { name: true, email: true } }),
                ]);
                const senderName = sender?.name || sender?.email || "Someone";
                const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
                await Promise.allSettled(
                    result.map((r) =>
                        sendDropSharedEmail(r.email, `${base}/d/${dropId}?r=${r.token}`, senderName, drop.customKey),
                    ),
                );
            } catch (error) {
                // Email is best-effort; never fail recipient creation over it.
                logger.error("Failed to send recipient notification emails", error);
            }
        }

        return result;
    }

    /** List a drop's recipients. No feature gate — a downgraded owner can still revoke. */
    static async listRecipients(scope: OwnerScope, dropId: string): Promise<RecipientListItem[]> {
        const drop = await prisma.drop.findUnique({ where: { id: dropId } });
        if (!drop) throw new NotFoundError("Drop not found");
        assertCanManage(drop, scope);

        return prisma.dropRecipient.findMany({
            where: { dropId },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                email: true,
                label: true,
                maxDownloads: true,
                downloads: true,
                expiresAt: true,
                revokedAt: true,
                lastAccessAt: true,
                createdAt: true,
            },
        });
    }

    /** Revoke a single recipient's future access (idempotent). Always allowed for the owner. */
    static async revokeRecipient(scope: OwnerScope, dropId: string, recipientId: string): Promise<void> {
        const drop = await prisma.drop.findUnique({ where: { id: dropId } });
        if (!drop) throw new NotFoundError("Drop not found");
        assertCanManage(drop, scope);

        const result = await prisma.dropRecipient.updateMany({
            where: { id: recipientId, dropId, revokedAt: null },
            data: { revokedAt: new Date() },
        });
        if (result.count === 0) {
            const exists = await prisma.dropRecipient.findFirst({
                where: { id: recipientId, dropId },
                select: { id: true },
            });
            if (!exists) throw new NotFoundError("Recipient not found");
            // Otherwise already revoked — treat as success (idempotent).
        }
    }

    /**
     * List a drop's per-download access events (owner-facing audit trail).
     * Requires the accessLogs entitlement (Pro+). The hashed IP is never returned.
     */
    static async listAccessEvents(
        scope: OwnerScope,
        dropId: string,
        options: { limit?: number } = {},
    ): Promise<AccessEventItem[]> {
        const { limit = 200 } = options;
        const drop = await prisma.drop.findUnique({ where: { id: dropId } });
        if (!drop) throw new NotFoundError("Drop not found");
        assertCanManage(drop, scope);

        const { features, tier } = await this.resolveDropFeatures(scope);
        if (!features.accessLogs) {
            throw new UpgradeRequiredError("Access logs require a Pro plan.", {
                scope: "drop_file_size",
                currentTier: tier,
                suggestedTier: "pro",
            });
        }

        const events = await prisma.dropAccessEvent.findMany({
            where: { dropId },
            orderBy: { createdAt: "desc" },
            take: Math.min(limit, 500),
            select: {
                id: true,
                eventType: true,
                fileId: true,
                createdAt: true,
                recipient: { select: { email: true, label: true } },
            },
        });
        return events.map((e) => ({
            id: e.id,
            eventType: e.eventType,
            fileId: e.fileId,
            createdAt: e.createdAt,
            recipientEmail: e.recipient?.email ?? null,
            recipientLabel: e.recipient?.label ?? null,
        }));
    }

}
