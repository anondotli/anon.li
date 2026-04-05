import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { cryptoService, CryptoConfig, calculateEncryptedSize } from "@/lib/crypto.client";
import { pMapLimit } from "@/lib/async-utils";
import {
    createDrop,
    addFileToDrop,
    uploadChunk,
    finishDrop,
} from "@/lib/drop.actions.client";
import { DROP_SIZE_LIMITS, EXPIRY_LIMITS, DROP_FEATURES } from "@/config/plans";
import { storeEncryptionKey } from "@/lib/upload-resume.client";
import { analytics } from "@/lib/analytics";

export type UploadPhase = "idle" | "encrypting" | "uploading" | "finalizing" | "complete" | "error";

export interface UploadProgress {
    phase: UploadPhase;
    currentFileIndex: number;
    totalFiles: number;
    currentFileName: string;
    encryptedChunks: number;
    uploadedChunks: number;
    totalChunks: number;
    bytesUploaded: number;
    totalBytes: number;
    error?: string;
}

interface UploadOptions {
    title?: string;
    message?: string;
    expiryDays?: number;
    maxDownloads?: number;
    password?: string;
    hideBranding?: boolean;
    notifyOnDownload?: boolean;
}

interface UseDropUploadProps {
    userTier?: string | null;
    remainingStorage?: number;
    isAuthenticated?: boolean;
    onComplete?: (dropId: string, shareUrl: string) => void;
}

interface ActiveUpload {
    dropId: string;
    fileId: string;
    s3UploadId: string;
    storageKey: string;
    // For anonymous drops, the DELETE endpoint requires this session token
    // to authorize the abort. Authenticated drops use the session cookie.
    sessionToken?: string;
}

export function useDropUpload({
    userTier,
    remainingStorage,
    isAuthenticated,
    onComplete,
}: UseDropUploadProps = {}) {
    const [files, setFiles] = useState<File[]>([]);
    const [progress, setProgress] = useState<UploadProgress | null>(null);
    const [shareUrl, setShareUrl] = useState<string | null>(null);
    const [dropMeta, setDropMeta] = useState<{ expiresAt?: string; maxDownloads?: number } | null>(null);
    const [abortController, setAbortController] = useState<AbortController | null>(null);

    // Track active uploads for cleanup - use ref to avoid stale closures
    const activeUploadsRef = useRef<ActiveUpload[]>([]);

    const tier = (userTier as "free" | "plus" | "pro") || "free";
    const isGuest = !isAuthenticated;
    const maxFileSize: number = isGuest ? DROP_SIZE_LIMITS.guest : Math.max(0, remainingStorage ?? 0);
    const maxExpiry: number = isGuest ? EXPIRY_LIMITS.guest : EXPIRY_LIMITS[tier];
    const features = DROP_FEATURES[tier];

    const reset = useCallback(() => {
        setFiles([]);
        setProgress(null);
        setShareUrl(null);
        setDropMeta(null);
        abortController?.abort();
        setAbortController(null);
    }, [abortController]);

    const cancel = useCallback(async () => {
        abortController?.abort();
        setAbortController(null);

        // Cleanup any active multipart uploads
        // This prevents orphaned uploads in S3
        const uploads = activeUploadsRef.current;
        activeUploadsRef.current = [];

        // Parallel cleanup — don't block on sequential fetches
        await Promise.allSettled(
            uploads.map((upload) =>
                fetch(`/api/v1/drop/${upload.dropId}/file/${upload.fileId}`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        s3UploadId: upload.s3UploadId,
                        ...(upload.sessionToken && { sessionToken: upload.sessionToken }),
                    }),
                    credentials: 'include',
                }).catch(() => {
                    // Ignore errors - best effort cleanup
                })
            )
        );

        // Clear progress after cleanup completes so UI doesn't flash prematurely
        setProgress(null);
    }, [abortController]);

    const upload = useCallback(async (
        options: UploadOptions = {},
        turnstileToken?: string | null
    ) => {
        if (files.length === 0) {
            toast.error("No files selected");
            return;
        }

        const controller = new AbortController();
        setAbortController(controller);
        const signal = controller.signal;

        const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

        setProgress({
            phase: "encrypting",
            currentFileIndex: 0,
            totalFiles: files.length,
            currentFileName: files[0]?.name || "",
            encryptedChunks: 0,
            uploadedChunks: 0,
            totalChunks: 0,
            bytesUploaded: 0,
            totalBytes,
        });

        analytics.dropUploadStarted(files.length);

        try {
            const encryptionContext = await cryptoService.createEncryptionContext();
            const { keyString, dropIvString, key, dropIv } = encryptionContext;

            // Handle custom key protection
            let customKey = false;
            let salt: string | undefined;
            let customKeyData: string | undefined;
            let customKeyIv: string | undefined;

            if (options.password && options.password.length >= 8) {
                const protection = await cryptoService.encryptKeyWithPassword(keyString, options.password);
                customKey = true;
                salt = protection.salt;
                customKeyData = protection.encryptedKey;
                customKeyIv = protection.iv;
            }

            let encryptedTitle: string | undefined;
            let encryptedMessage: string | undefined;

            if (options.title) {
                encryptedTitle = await cryptoService.encryptFilename(options.title, key, dropIv);
            }
            if (options.message) {
                encryptedMessage = await cryptoService.encryptFilename(options.message, key, dropIv);
            }

            const { dropId, sessionToken, expiresAt } = await createDrop({
                iv: dropIvString,
                ...(customKey && { customKey: true }),
                ...(encryptedTitle && { encryptedTitle }),
                ...(encryptedMessage && { encryptedMessage }),
                ...(options.expiryDays && { expiry: options.expiryDays }),
                ...(options.maxDownloads && { maxDownloads: options.maxDownloads }),
                ...(customKey && {
                    salt,
                    customKeyData,
                    customKeyIv,
                }),
                ...(options.hideBranding && features.noBranding && { hideBranding: true }),
                ...(options.notifyOnDownload && features.downloadNotifications && { notifyOnDownload: true }),
                ...(isGuest && turnstileToken && { turnstileToken }),
                fileCount: files.length,
            }, signal);

            setDropMeta({
                expiresAt: expiresAt ?? undefined,
                maxDownloads: options.maxDownloads,
            });

            let totalUploadedChunks = 0;
            const totalChunksAllFiles = files.reduce((sum, f) =>
                sum + CryptoConfig.getChunkParams(f.size).chunkCount, 0
            );

            // Collect etags for batched finalization
            const fileChunkRecords: { fileId: string; chunks: { chunkIndex: number; etag: string }[] }[] = [];

            for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
                const file = files[fileIndex];
                if (!file) continue;

                setProgress(p => p ? {
                    ...p,
                    phase: "encrypting",
                    currentFileIndex: fileIndex,
                    currentFileName: file.name,
                    totalChunks: totalChunksAllFiles,
                } : null);

                // Calculate chunk parameters
                const { chunkSize, chunkCount } = CryptoConfig.getChunkParams(file.size);
                const encryptedSize = calculateEncryptedSize(file.size, chunkSize);

                // Generate a unique IV per file to prevent AES-GCM nonce reuse
                const fileIvString = cryptoService.generateFileIv();
                const fileIv = new Uint8Array(cryptoService.base64UrlToArrayBuffer(fileIvString));

                // Encrypt filename with per-file IV
                const encryptedName = await cryptoService.encryptFilename(file.name, key, fileIv);

                // Add file to drop
                const { fileId, s3UploadId, uploadUrls } = await addFileToDrop(dropId, {
                    size: encryptedSize,  // Send encrypted size (includes GCM auth tags)
                    encryptedName,
                    iv: fileIvString,
                    mimeType: file.type || "application/octet-stream",
                    chunkCount,
                    chunkSize,
                    ...(sessionToken && { sessionToken }),
                }, signal);

                // Track for cleanup on cancel
                activeUploadsRef.current.push({
                    dropId,
                    fileId,
                    s3UploadId,
                    storageKey: '', // Not needed for abort
                    ...(sessionToken && { sessionToken }),
                });

                // Upload chunks (encrypt + PUT) with bounded concurrency so
                // the pipeline fills the network without OOMing on huge files.
                // Order of etags is preserved by pMapLimit's index-keyed output.
                setProgress(p => p ? { ...p, phase: "uploading" } : null);
                const concurrency = CryptoConfig.getConcurrency(file.size);
                const chunkIndexes = Array.from({ length: chunkCount }, (_, i) => i);

                const chunks = await pMapLimit(chunkIndexes, concurrency, async (chunkIndex) => {
                    if (signal.aborted) throw new Error("Upload cancelled");

                    const start = chunkIndex * chunkSize;
                    const end = Math.min(start + chunkSize, file.size);
                    const chunkData = await file.slice(start, end).arrayBuffer();

                    const encryptedChunkData = await cryptoService.encryptChunk(
                        chunkData,
                        key,
                        fileIv,
                        chunkIndex
                    );

                    const presignedUrl = uploadUrls[chunkIndex + 1];
                    if (!presignedUrl) {
                        throw new Error(`Missing upload URL for chunk ${chunkIndex + 1}`);
                    }
                    const etag = await uploadChunk(presignedUrl, encryptedChunkData, signal);

                    totalUploadedChunks++;
                    setProgress(p => p ? {
                        ...p,
                        uploadedChunks: totalUploadedChunks,
                        bytesUploaded: Math.round((totalUploadedChunks / totalChunksAllFiles) * totalBytes),
                    } : null);

                    return { chunkIndex, etag };
                });

                fileChunkRecords.push({ fileId, chunks });
            }

            // Batch finalize: record chunks + complete files + complete drop
            setProgress(p => p ? { ...p, phase: "finalizing" } : null);
            await finishDrop(dropId, fileChunkRecords, sessionToken || undefined, signal);
            activeUploadsRef.current = [];

            // Persist the encryption key so the dashboard can decrypt drop titles/filenames
            try {
                await storeEncryptionKey(dropId, keyString);
            } catch (e) {
                console.warn("Failed to save encryption key locally — bookmark your share link.", e);
            }

            const baseUrl = window.location.origin;
            const url = customKey
                ? `${baseUrl}/d/${dropId}`
                : `${baseUrl}/d/${dropId}#${keyString}`;

            setShareUrl(url);
            setProgress(p => p ? { ...p, phase: "complete" } : null);
            analytics.dropUploadCompleted(dropId);

            toast.success(
                files.length === 1
                    ? "File uploaded successfully!"
                    : `${files.length} files uploaded successfully!`
            );

            onComplete?.(dropId, url);

        } catch (error) {
            if (error instanceof Error && error.message === "Upload cancelled") {
                toast.info("Upload cancelled");
                setProgress(null);
            } else {
                // Clean up any active multipart uploads to prevent orphaned S3 parts
                const uploads = activeUploadsRef.current;
                activeUploadsRef.current = [];
                if (uploads.length > 0) {
                    Promise.allSettled(
                        uploads.map((upload) =>
                            fetch(`/api/v1/drop/${upload.dropId}/file/${upload.fileId}`, {
                                method: 'DELETE',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    s3UploadId: upload.s3UploadId,
                                    ...(upload.sessionToken && { sessionToken: upload.sessionToken }),
                                }),
                                credentials: 'include',
                            }).catch(() => {})
                        )
                    );
                }

                const message = error instanceof Error ? error.message : "Upload failed";
                setProgress(p => p ? { ...p, phase: "error", error: message } : null);
                toast.error(message);
            }
        } finally {
            setAbortController(null);
        }
    }, [files, features, isGuest, onComplete]);

    return {
        files,
        setFiles,
        progress,
        shareUrl,
        dropMeta,

        isGuest,
        maxFileSize,
        maxExpiry,
        features,
        isUploading: progress !== null && progress.phase !== "complete" && progress.phase !== "error",
        
        upload,
        cancel,
        reset,
    };
}
