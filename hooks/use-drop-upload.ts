import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { cryptoService, CryptoConfig, calculateEncryptedSize } from "@/lib/crypto.client";
import { pMapLimit } from "@/lib/async-utils";
import {
    createDrop,
    addFileToDrop,
    uploadChunk,
    finishDrop,
    UpgradeRequiredClientError,
} from "@/lib/drop.actions.client";
import {
    createGuestDrop,
    addFileToGuestDrop,
    finishGuestDrop,
    abortGuestFileUpload,
} from "@/lib/drop.actions.guest";
import type { UpgradeRequiredDetails } from "@/lib/api-error-utils";
import { DROP_FEATURES, GUEST_MAX_FILES_PER_DROP, PLAN_ENTITLEMENTS } from "@/config/plans";
import { DROP_PASSWORD_MIN_LENGTH } from "@/lib/constants";
import { extractStoredKeyMaterial } from "@/lib/vault/crypto";
import { upsertCachedWrappedDropKey } from "@/lib/vault/drop-keys-client";
import { useOptionalVault } from "@/components/vault/vault-provider";
import { authClient } from "@/lib/auth-client";
import { analytics } from "@/lib/analytics";
import { getUploadFilePath } from "@/lib/drop-file-selection";

type UploadPhase = "idle" | "encrypting" | "uploading" | "finalizing" | "complete" | "error";

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
    turnstileToken?: string;
}

interface UseDropUploadProps {
    userTier?: string | null;
    remainingStorage?: number;
    guest?: boolean;
    onComplete?: (dropId: string, shareUrl: string) => void;
    onUpgradeRequired?: (details: UpgradeRequiredDetails) => void;
}

interface ActiveUpload {
    dropId: string;
    fileId: string;
    s3UploadId: string;
    storageKey: string;
}

interface FileChunkManifest {
    fileId: string;
    chunks: { chunkIndex: number; etag: string }[];
}

interface PendingFinalization {
    dropId: string;
    guest: boolean;
    uploadToken: string | null;
    files: FileChunkManifest[];
    keyString: string;
    customKey: boolean;
    keyCache: {
        wrappedKey: string;
        vaultGeneration: number;
        organizationId: string | null;
        orgKeyGeneration?: number;
    } | null;
}

export function useDropUpload({
    userTier,
    remainingStorage,
    guest = false,
    onComplete,
    onUpgradeRequired,
}: UseDropUploadProps = {}) {
    const vault = useOptionalVault()
    // When a team is the active context, drops are owned by the org and their
    // owner key is wrapped to the shared org vault key so every member can open
    // them. Personal context (no active org) keeps the per-user wrap.
    const { data: activeOrg } = authClient.useActiveOrganization()
    const organizationId = activeOrg?.id ?? null
    const [files, setFiles] = useState<File[]>([]);
    const [progress, setProgress] = useState<UploadProgress | null>(null);
    const [shareUrl, setShareUrl] = useState<string | null>(null);
    const [dropMeta, setDropMeta] = useState<{ expiresAt?: string; maxDownloads?: number } | null>(null);
    const [abortController, setAbortController] = useState<AbortController | null>(null);
    const [hasPendingFinalization, setHasPendingFinalization] = useState(false);

    // Track active uploads for cleanup - use ref to avoid stale closures
    const activeUploadsRef = useRef<ActiveUpload[]>([]);
    // Guest upload token — kept only in memory for the duration of the session.
    const uploadTokenRef = useRef<string | null>(null);
    // Once every encrypted part is in R2, keep everything needed to retry only
    // the idempotent server-side finalization step. Re-encrypting at this point
    // would produce a new key/drop and could strand an already completed object.
    const pendingFinalizationRef = useRef<PendingFinalization | null>(null);
    const finalizationInFlightRef = useRef(false);

    const tier = guest
        ? "guest" as const
        : ((userTier as "free" | "plus" | "pro") || "free");
    const features = DROP_FEATURES[tier];

    const reset = useCallback(() => {
        setFiles([]);
        setProgress(null);
        setShareUrl(null);
        setDropMeta(null);
        activeUploadsRef.current = [];
        uploadTokenRef.current = null;
        pendingFinalizationRef.current = null;
        finalizationInFlightRef.current = false;
        setHasPendingFinalization(false);
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
        const token = uploadTokenRef.current;
        uploadTokenRef.current = null;
        pendingFinalizationRef.current = null;
        finalizationInFlightRef.current = false;
        setHasPendingFinalization(false);

        // Parallel cleanup — don't block on sequential fetches
        await Promise.allSettled(
            uploads.map((upload) => {
                if (guest) {
                    return abortGuestFileUpload(upload.dropId, upload.fileId, upload.s3UploadId, token ?? "");
                }
                return fetch(`/api/v1/drop/${upload.dropId}/file/${upload.fileId}`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        s3UploadId: upload.s3UploadId,
                    }),
                    credentials: 'include',
                }).catch(() => {
                    // Ignore errors - best effort cleanup
                });
            })
        );

        // Clear progress after cleanup completes so UI doesn't flash prematurely
        setProgress(null);
    }, [abortController, guest]);

    const prepareRetry = useCallback(() => {
        // Keep the selected File objects/configuration, but leave the error
        // screen so guest uploads can render a fresh Turnstile challenge.
        setProgress((current) => current?.phase === "error" ? null : current);
    }, []);

    const finishPendingFinalization = useCallback(async (
        pending: PendingFinalization,
        signal: AbortSignal,
    ): Promise<void> => {
        if (pending.guest) {
            if (!pending.uploadToken) {
                throw new Error("Upload authorization expired");
            }
            await finishGuestDrop(pending.dropId, pending.files, pending.uploadToken, signal);
        } else {
            await finishDrop(pending.dropId, pending.files, signal);
        }

        // Explicit cancel/start-over may have retired this attempt while the
        // request was in flight. In that case, do not resurrect its success UI.
        if (pendingFinalizationRef.current !== pending) return;

        pendingFinalizationRef.current = null;
        activeUploadsRef.current = [];
        uploadTokenRef.current = null;
        setHasPendingFinalization(false);

        if (pending.keyCache) {
            try {
                upsertCachedWrappedDropKey({
                    dropId: pending.dropId,
                    wrappedKey: pending.keyCache.wrappedKey,
                    vaultGeneration: pending.keyCache.vaultGeneration,
                    ...(pending.keyCache.organizationId
                        ? {
                            organizationId: pending.keyCache.organizationId,
                            orgKeyGeneration: pending.keyCache.orgKeyGeneration,
                        }
                        : {}),
                });
            } catch {
                // Finalization already succeeded. A cache miss is recoverable
                // from the server and must not turn success into another retry.
            }
        }

        const baseUrl = window.location.origin;
        const url = pending.customKey
            ? `${baseUrl}/d/${pending.dropId}`
            : `${baseUrl}/d/${pending.dropId}#${pending.keyString}`;

        setShareUrl(url);
        setProgress((current) => current ? { ...current, phase: "complete", error: undefined } : current);

        try {
            analytics.dropUploadCompleted();
        } catch {
            // Analytics is non-critical after a committed upload.
        }

        toast.success(
            pending.files.length === 1
                ? "File uploaded successfully!"
                : `${pending.files.length} files uploaded successfully!`
        );

        try {
            onComplete?.(pending.dropId, url);
        } catch {
            // Consumer callbacks must not convert a committed upload to failure.
        }
    }, [onComplete]);

    const retryFinalization = useCallback(async (): Promise<void> => {
        const pending = pendingFinalizationRef.current;
        if (!pending || finalizationInFlightRef.current) return;

        const controller = new AbortController();
        const signal = controller.signal;
        finalizationInFlightRef.current = true;
        setAbortController(controller);
        setProgress((current) => current ? {
            ...current,
            phase: "finalizing",
            error: undefined,
        } : current);

        try {
            await finishPendingFinalization(pending, signal);
        } catch (error) {
            if (signal.aborted) return;
            const message = error instanceof Error ? error.message : "Upload failed";
            setProgress((current) => current ? { ...current, phase: "error", error: message } : current);
            toast.error(message);
        } finally {
            finalizationInFlightRef.current = false;
            setAbortController((current) => current === controller ? null : current);
        }
    }, [finishPendingFinalization]);

    const upload = useCallback(async (
        options: UploadOptions = {},
    ) => {
        if (files.length === 0) {
            toast.error("No files selected");
            return;
        }

        // Vault must be unlocked to create authenticated drops — the encryption
        // key is wrapped and stored for later retrieval. Guest drops skip the
        // vault entirely: the key lives only in the URL fragment.
        if (!guest) {
            if (!vault || vault.status !== "unlocked" || !vault.vaultGeneration || !vault.vaultId) {
                toast.error("Your vault must be unlocked to create drops. Unlock your vault and try again.");
                return;
            }
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
            let wrappedOwnerKey: string | null = null;
            let orgKeyGeneration: number | undefined;
            if (!guest) {
                const ownerKeyMaterial = extractStoredKeyMaterial(keyString);
                if (organizationId) {
                    const wrapped = await vault!.wrapDropKeyForOrg(ownerKeyMaterial, organizationId);
                    wrappedOwnerKey = wrapped.wrappedKey;
                    orgKeyGeneration = wrapped.orgKeyGeneration;
                } else {
                    wrappedOwnerKey = await vault!.wrapDropKey(ownerKeyMaterial);
                }
            }

            // Handle custom key protection
            let customKey = false;
            let salt: string | undefined;
            let customKeyData: string | undefined;
            let customKeyIv: string | undefined;

            if (options.password && options.password.length >= DROP_PASSWORD_MIN_LENGTH) {
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
                encryptedMessage = await cryptoService.encryptMessage(options.message, key, dropIv);
            }

            const commonDropFields = {
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
                fileCount: files.length,
            };

            let dropId: string;
            let expiresAt: string | null;
            if (guest) {
                const guestResult = await createGuestDrop({
                    ...commonDropFields,
                    ...(options.turnstileToken ? { turnstileToken: options.turnstileToken } : {}),
                }, signal);
                dropId = guestResult.dropId;
                expiresAt = guestResult.expiresAt;
                uploadTokenRef.current = guestResult.uploadToken;
            } else {
                const authResult = await createDrop({
                    ...commonDropFields,
                    wrappedKey: wrappedOwnerKey!,
                    vaultId: vault!.vaultId!,
                    vaultGeneration: vault!.vaultGeneration!,
                    ...(orgKeyGeneration ? { orgKeyGeneration } : {}),
                }, signal);
                dropId = authResult.dropId;
                expiresAt = authResult.expiresAt;
            }

            setDropMeta({
                expiresAt: expiresAt ?? undefined,
                maxDownloads: options.maxDownloads,
            });

            let totalUploadedChunks = 0;
            const totalChunksAllFiles = files.reduce((sum, f) =>
                sum + CryptoConfig.getChunkParams(f.size).chunkCount, 0
            );

            // Collect etags for batched finalization
            const fileChunkRecords: FileChunkManifest[] = [];

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
                const encryptedName = await cryptoService.encryptFilename(getUploadFilePath(file), key, fileIv);

                const addFilePayload = {
                    size: encryptedSize,  // Send encrypted size (includes GCM auth tags)
                    encryptedName,
                    iv: fileIvString,
                    mimeType: file.type || "application/octet-stream",
                    chunkCount,
                    chunkSize,
                };

                const { fileId, s3UploadId, uploadUrls } = guest
                    ? await addFileToGuestDrop(dropId, addFilePayload, uploadTokenRef.current!, signal)
                    : await addFileToDrop(dropId, addFilePayload, signal);

                // Track for cleanup on cancel
                activeUploadsRef.current.push({
                    dropId,
                    fileId,
                    s3UploadId,
                    storageKey: '', // Not needed for abort
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

            // Batch finalize: record chunks + complete files + complete drop.
            // Save the full success context before the request so a timeout can
            // retry this exact manifest instead of creating a second drop.
            const pendingFinalization: PendingFinalization = {
                dropId,
                guest,
                uploadToken: uploadTokenRef.current,
                files: fileChunkRecords,
                keyString,
                customKey,
                keyCache: guest ? null : {
                    wrappedKey: wrappedOwnerKey!,
                    vaultGeneration: vault!.vaultGeneration!,
                    organizationId,
                    ...(orgKeyGeneration ? { orgKeyGeneration } : {}),
                },
            };
            pendingFinalizationRef.current = pendingFinalization;
            setHasPendingFinalization(true);
            finalizationInFlightRef.current = true;
            setProgress(p => p ? { ...p, phase: "finalizing" } : null);
            await finishPendingFinalization(pendingFinalization, signal);

        } catch (error) {
            if (signal.aborted || (error instanceof Error && error.message === "Upload cancelled")) {
                toast.info("Upload cancelled");
                setProgress(null);
            } else {
                // Before all chunks are uploaded, retain the existing best-effort
                // cleanup. Once finalization starts, preserve the rows, token, key,
                // and ETags: the server outcome may be ambiguous and is retryable.
                if (!pendingFinalizationRef.current) {
                    const uploads = activeUploadsRef.current;
                    activeUploadsRef.current = [];
                    const token = uploadTokenRef.current;
                    uploadTokenRef.current = null;
                    if (uploads.length > 0) {
                        Promise.allSettled(
                            uploads.map((upload) => {
                                if (guest) {
                                    return abortGuestFileUpload(upload.dropId, upload.fileId, upload.s3UploadId, token ?? "");
                                }
                                return fetch(`/api/v1/drop/${upload.dropId}/file/${upload.fileId}`, {
                                    method: 'DELETE',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        s3UploadId: upload.s3UploadId,
                                    }),
                                    credentials: 'include',
                                }).catch(() => {});
                            })
                        );
                    }
                }

                if (error instanceof UpgradeRequiredClientError && !pendingFinalizationRef.current) {
                    setProgress(null);
                    onUpgradeRequired?.(error.details);
                } else {
                    const message = error instanceof Error ? error.message : "Upload failed";
                    setProgress(p => p ? { ...p, phase: "error", error: message } : null);
                    toast.error(message);
                }
            }
        } finally {
            finalizationInFlightRef.current = false;
            setAbortController(null);
        }
    }, [files, features, guest, onUpgradeRequired, vault, organizationId, finishPendingFinalization]);

    return {
        files,
        setFiles,
        progress,
        shareUrl,
        dropMeta,

        maxFileSize: Math.max(0, remainingStorage ?? PLAN_ENTITLEMENTS.drop[tier].maxFileSize),
        maxFiles: guest ? GUEST_MAX_FILES_PER_DROP : 50,
        maxExpiry: PLAN_ENTITLEMENTS.drop[tier].maxExpiryDays,
        features,
        isUploading: hasPendingFinalization || (progress !== null && progress.phase !== "complete" && progress.phase !== "error"),
        hasPendingFinalization,

        upload,
        cancel,
        prepareRetry,
        retryFinalization,
        reset,
    };
}
