import {
    createDropAction,
    addFileToDropAction,
    finishDropAction,
    getDropAction,
    recordDownloadAction,
    type CreateDropActionResult,
    type AddFileActionResult,
    type FinishDropActionResult,
    type GetDropActionResult,
    type RecordDownloadActionResult,
} from "@/actions/drop";

// Re-export uploadChunk from drop.client.ts - this still needs direct S3 upload
export { uploadChunk } from "@/lib/drop.client";

// Import types needed locally
import type { DropMetadata } from "@/lib/drop.client";

// Re-export types from drop.client.ts for compatibility
export type {
    DropMetadata,
} from "@/lib/drop.client";

/**
 * Create a new drop using server action
 */
export async function createDrop(
    data: {
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
        wrappedKey: string;
        vaultId: string;
        vaultGeneration: number;
    },
    signal?: AbortSignal
): Promise<{ dropId: string; expiresAt: string | null }> {
    // Check if aborted before calling action
    if (signal?.aborted) {
        throw new Error("Upload cancelled");
    }

    const result: CreateDropActionResult = await createDropAction(data);

    if (result.error) {
        throw new Error(result.error);
    }

    return {
        dropId: result.dropId!,
        expiresAt: result.expiresAt ?? null,
    };
}

/**
 * Add a file to a drop using server action
 */
export async function addFileToDrop(
    dropId: string,
    data: {
        size: number;
        encryptedName: string;
        iv: string;
        mimeType: string;
        chunkCount: number;
        chunkSize: number;
    },
    signal?: AbortSignal
): Promise<{ fileId: string; s3UploadId: string; uploadUrls: Record<number, string> }> {
    // Check if aborted before calling action
    if (signal?.aborted) {
        throw new Error("Upload cancelled");
    }

    const result: AddFileActionResult = await addFileToDropAction({
        dropId,
        ...data,
    });

    if (result.error) {
        throw new Error(result.error);
    }

    return {
        fileId: result.fileId!,
        s3UploadId: result.s3UploadId!,
        uploadUrls: result.uploadUrls!,
    };
}

/**
 * Batch finalize a drop: record all chunks, complete all files, complete the drop.
 */
export async function finishDrop(
    dropId: string,
    files: { fileId: string; chunks: { chunkIndex: number; etag: string }[] }[],
    signal?: AbortSignal
): Promise<void> {
    if (signal?.aborted) {
        throw new Error("Upload cancelled");
    }

    const result: FinishDropActionResult = await finishDropAction({
        dropId,
        files,
    });

    if (result.error) {
        throw new Error(result.error);
    }
}

// ============================================================================
// Download Flow (server action wrappers)
// ============================================================================

/**
 * Get drop metadata for the download page using server action
 */
export async function getDrop(
    dropId: string,
    signal?: AbortSignal
): Promise<DropMetadata> {
    if (signal?.aborted) {
        throw new Error("Request cancelled");
    }

    const result: GetDropActionResult = await getDropAction(dropId);

    if (result.error) {
        throw new Error(result.error);
    }

    return result.drop! as DropMetadata;
}

/**
 * Record a download and get signed URLs using server action
 */
export async function recordDownload(
    dropId: string,
    signal?: AbortSignal
): Promise<Record<string, string>> {
    if (signal?.aborted) {
        throw new Error("Request cancelled");
    }

    const result: RecordDownloadActionResult = await recordDownloadAction(dropId);

    if (result.error) {
        throw new Error(result.error);
    }

    return result.downloadUrls!;
}
