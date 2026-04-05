import { useState, useEffect, useCallback } from "react";
import { cryptoService } from "@/lib/crypto.client";
import { getDrop, recordDownload, type DropMetadata } from "@/lib/drop.actions.client";
import { zipSync } from "fflate";
import { MAX_ZIP_SIZE, MIN_CHUNK_SIZE, AUTH_TAG_SIZE } from "@/lib/constants";
import { normalizeDropKeyInput } from "@/lib/drop-link";

/**
 * Sanitize filename to prevent path traversal and invalid characters
 */
function sanitizeFilename(name: string): string {
    return name
        .replace(/\.\.[/\\]/g, '')           // Remove path traversal
        .replace(/\0/g, '')                   // Remove null bytes
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') // Invalid chars
        .slice(0, 200) || 'unnamed_file';     // Length limit
}

export interface DecryptedFile {
    id: string;
    encryptedName: string;
    decryptedName: string;
    size: number;
    mimeType: string;
    iv: string;
    chunkSize: number | null;
    chunkCount: number | null;
}

export interface DecryptedDrop {
    id: string;
    title: string | null;
    message: string | null;
    downloads: number;
    maxDownloads: number | null;
    expiresAt: Date | null;
    hideBranding: boolean;
    files: DecryptedFile[];
}

interface UseDropDownloadProps {
    dropId: string;
    initialDrop?: DropMetadata | null;
    initialError?: string | null;
}

export function useDropDownload({
    dropId,
    initialDrop = null,
    initialError = null,
}: UseDropDownloadProps) {
    const [rawDrop, setRawDrop] = useState<DropMetadata | null>(initialDrop);
    const [drop, setDrop] = useState<DecryptedDrop | null>(null);
    const [loading, setLoading] = useState(!initialDrop && !initialError);
    const [error, setError] = useState<string | null>(initialError);

    const [keyString, setKeyString] = useState<string | null>(null);
    const [hasKeyFromUrl, setHasKeyFromUrl] = useState(false);
    const [manualKeyInput, setManualKeyInput] = useState("");
    const [manualKeyError, setManualKeyError] = useState<string | null>(null);

    const [decryptionFailed, setDecryptionFailed] = useState(false);

    const [password, setPassword] = useState("");
    const [passwordError, setPasswordError] = useState<string | null>(null);

    const [downloading, setDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [currentFile, setCurrentFile] = useState<string | null>(null);

    useEffect(() => {
        const hash = window.location.hash.slice(1);
        if (hash) {
            setKeyString(hash);
            setHasKeyFromUrl(true);
        }
    }, []);

    useEffect(() => {
        if (!dropId || initialDrop || initialError) {
            return;
        }

        const fetchDrop = async () => {
            try {
                const data = await getDrop(dropId);
                setRawDrop(data);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to load drop");
            } finally {
                setLoading(false);
            }
        };

        fetchDrop();
    }, [dropId, initialDrop, initialError]);

    // Decrypt content when we have both drop and key
    useEffect(() => {
        const decryptContent = async () => {
            if (!rawDrop || !keyString) return;

            setDecryptionFailed(false);

            try {
                const key = await cryptoService.importKey(keyString);
                const dropIv = new Uint8Array(cryptoService.base64UrlToArrayBuffer(rawDrop.iv));

                // Decrypt filenames
                let decryptFailures = 0;
                const decryptedFiles = await Promise.all(
                    rawDrop.files.map(async (file) => {
                        try {
                            const fileIv = new Uint8Array(cryptoService.base64UrlToArrayBuffer(file.iv));
                            const decryptedName = await cryptoService.decryptFilename(file.encryptedName, key, fileIv);
                            return {
                                id: file.id,
                                encryptedName: file.encryptedName,
                                decryptedName,
                                size: parseInt(file.size),
                                mimeType: file.mimeType,
                                iv: file.iv,
                                chunkSize: file.chunkSize ?? null,
                                chunkCount: file.chunkCount ?? null,
                            };
                        } catch {
                            decryptFailures++;
                            return {
                                id: file.id,
                                encryptedName: file.encryptedName,
                                decryptedName: `File ${file.id}`,
                                size: parseInt(file.size),
                                mimeType: file.mimeType,
                                iv: file.iv,
                                chunkSize: file.chunkSize ?? null,
                                chunkCount: file.chunkCount ?? null,
                            };
                        }
                    })
                );

                if (decryptFailures > 0) {
                    throw new Error("Filename decryption failed");
                }

                // Decrypt title and message
                let title: string | null = null;
                let message: string | null = null;

                if (rawDrop.encryptedTitle) {
                    try {
                        title = await cryptoService.decryptFilename(rawDrop.encryptedTitle, key, dropIv);
                    } catch {
                        // Ignore
                    }
                }

                if (rawDrop.encryptedMessage) {
                    try {
                        message = await cryptoService.decryptFilename(rawDrop.encryptedMessage, key, dropIv);
                    } catch {
                        // Ignore
                    }
                }

                setDrop({
                    id: rawDrop.id,
                    title,
                    message,
                    downloads: rawDrop.downloads,
                    maxDownloads: rawDrop.maxDownloads,
                    expiresAt: rawDrop.expiresAt ? new Date(rawDrop.expiresAt) : null,
                    hideBranding: rawDrop.hideBranding,
                    files: decryptedFiles,
                });
            } catch {
                // Wrong key — reset so user can try again
                setKeyString(null);
                setHasKeyFromUrl(false);
                setDecryptionFailed(true);
            }
        };

        decryptContent();
    }, [rawDrop, keyString]);

    // Handle password submission
    const submitPassword = useCallback(async () => {
        if (!rawDrop || !password) return;

        setPasswordError(null);

        try {
            if (!rawDrop.customKeyData || !rawDrop.customKeyIv || !rawDrop.salt) {
                throw new Error("Missing custom key data");
            }

            const derivedKey = await cryptoService.decryptKeyWithPassword(
                rawDrop.customKeyData,
                password,
                rawDrop.salt,
                rawDrop.customKeyIv
            );

            setKeyString(derivedKey);
        } catch {
            setPasswordError("Incorrect password");
        }
    }, [rawDrop, password]);

    // Handle manual key submission
    const submitManualKey = useCallback(async () => {
        if (!manualKeyInput.trim()) {
            setManualKeyError("Please enter a decryption key");
            return;
        }

        const key = normalizeDropKeyInput(manualKeyInput);

        if (!key) {
            setManualKeyError("Paste the full share link or the 43-character key from after #");
            return;
        }

        setManualKeyError(null);
        setKeyString(key);
    }, [manualKeyInput]);

    // Download a single file
    const downloadFile = useCallback(async (fileId: string) => {
        if (!drop || !keyString) return;

        const file = drop.files.find(f => f.id === fileId);
        if (!file) return;

        setDownloading(true);
        setDownloadProgress(0);
        setCurrentFile(file.decryptedName);

        try {
            const key = await cryptoService.importKey(keyString);
            const iv = new Uint8Array(cryptoService.base64UrlToArrayBuffer(file.iv));

            const response = await fetch(`/api/v1/drop/${dropId}/file/${fileId}`);
            if (!response.ok) {
                 const errorText = await response.text();
                 try {
                     const errorJson = JSON.parse(errorText);
                     throw new Error(errorJson.error || "Failed to download file");
                 } catch {
                     throw new Error(errorText || "Failed to download file");
                 }
            }

            if (!response.body) throw new Error("ReadableStream not supported in this browser");

            const chunkSize = file.chunkSize || MIN_CHUNK_SIZE;
            const decryptionStream = cryptoService.createDecryptionStream(key, iv, chunkSize);
            const decryptedStream = response.body.pipeThrough(decryptionStream);

            if ('showSaveFilePicker' in window) {
                try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const handle = await (window as any).showSaveFilePicker({
                        suggestedName: file.decryptedName,
                    });
                    const writable = await handle.createWritable();

                    // Pipe directly to disk
                    // We need a custom writer to track progress since pipeTo doesn't provide it natively
                    const reader = decryptedStream.getReader();
                    const writer = writable.getWriter();

                    const totalSize = file.size;
                    let written = 0;

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        await writer.write(value);
                        written += value.length;
                        setDownloadProgress(Math.round((written / totalSize) * 100));
                    }

                    await writer.close();
                    return; // Success
                } catch (err: unknown) {
                    // User cancelled picker or API failed -> Fallback to Blob
                    if (err instanceof Error && err.name === 'AbortError') {
                        setDownloading(false);
                        return;
                    }
                    // File System Access API failed — fall back to in-memory blob download
                }
            }

            const reader = decryptedStream.getReader();
            const chunks: Uint8Array[] = [];
            let receivedLength = 0;
            const totalSize = file.size;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                chunks.push(value);
                receivedLength += value.length;

                setDownloadProgress(Math.round((receivedLength / totalSize) * 100));
            }

            const blob = new Blob(chunks as BlobPart[], { type: "application/octet-stream" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = sanitizeFilename(file.decryptedName);
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);

        } catch (err) {
            setError(err instanceof Error ? err.message : "Download failed");
        } finally {
            setDownloading(false);
            setCurrentFile(null);
            setDownloadProgress(0);
        }
    }, [drop, keyString, dropId]);

    // Download all files as ZIP
    const downloadAll = useCallback(async () => {
        if (!drop || !keyString || drop.files.length === 0) return;

        // Single file - just download directly
        if (drop.files.length === 1 && drop.files[0]) {
            return downloadFile(drop.files[0].id);
        }

        const totalSize = drop.files.reduce((sum, f) => sum + f.size, 0);

        // Check size limit
        if (totalSize > MAX_ZIP_SIZE) {
            setError(
                `This drop is too large (${formatBytes(totalSize)}) to download as a ZIP. ` +
                `Please download files individually.`
            );
            return;
        }

        setDownloading(true);
        setDownloadProgress(0);
        setCurrentFile("Preparing download...");

        try {
            // Record download and get signed URLs
            const downloadUrls = await recordDownload(dropId);

            const key = await cryptoService.importKey(keyString);
            const zipFiles: { [key: string]: Uint8Array } = {};

            for (let i = 0; i < drop.files.length; i++) {
                const file = drop.files[i];
                if (!file) continue;

                const downloadUrl = downloadUrls[file.id];

                if (!downloadUrl) {
                    console.error(`Missing download URL for file ${file.id}`);
                    continue;
                }

                setCurrentFile(`Downloading ${file.decryptedName}...`);
                setDownloadProgress(Math.round((i / drop.files.length) * 80));

                const iv = new Uint8Array(cryptoService.base64UrlToArrayBuffer(file.iv));

                // Fetch and decrypt
                const response = await fetch(downloadUrl);
                if (!response.ok) throw new Error(`Failed to download ${file.decryptedName}`);

                const encryptedData = await response.arrayBuffer();
                const totalEncryptedSize = encryptedData.byteLength;

                // Calculate chunks - use stored size or estimate
                const baseChunkSize = file.chunkSize || Math.ceil(file.size / Math.ceil(file.size / MIN_CHUNK_SIZE));
                const encryptedChunkSize = baseChunkSize + AUTH_TAG_SIZE;
                const chunkCount = Math.ceil(totalEncryptedSize / encryptedChunkSize);

                const decryptedChunks: ArrayBuffer[] = [];
                for (let j = 0; j < chunkCount; j++) {
                    const start = j * encryptedChunkSize;
                    const end = Math.min(start + encryptedChunkSize, totalEncryptedSize);
                    const chunk = encryptedData.slice(start, end);
                    const decrypted = await cryptoService.decryptChunk(chunk, key, iv, j);
                    decryptedChunks.push(decrypted);
                }

                // Combine
                const totalDecryptedSize = decryptedChunks.reduce((sum, c) => sum + c.byteLength, 0);
                const combined = new Uint8Array(totalDecryptedSize);
                let offset = 0;
                for (const chunk of decryptedChunks) {
                    combined.set(new Uint8Array(chunk), offset);
                    offset += chunk.byteLength;
                }

                zipFiles[sanitizeFilename(file.decryptedName)] = combined;
            }

            setCurrentFile("Creating ZIP archive...");
            setDownloadProgress(85);

            const zipped = zipSync(zipFiles);

            setCurrentFile("Downloading...");
            setDownloadProgress(95);

            const blob = new Blob([zipped.buffer as ArrayBuffer], { type: "application/zip" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            const safeTitle = drop.title
                ? drop.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 200)
                : null;
            a.download = safeTitle ? `${safeTitle}.zip` : "anon-li-drop.zip";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);

            setDownloadProgress(100);

        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create ZIP");
        } finally {
            setDownloading(false);
            setCurrentFile(null);
        }
    }, [drop, keyString, downloadFile, dropId]);

    // Utility functions
    const getTotalSize = useCallback(() => {
        if (!drop) return 0;
        return drop.files.reduce((sum, f) => sum + f.size, 0);
    }, [drop]);

    const canDownloadAsZip = useCallback(() => {
        return getTotalSize() <= MAX_ZIP_SIZE;
    }, [getTotalSize]);

    return {
        drop,
        loading,
        error,
        setError,

        // Key state
        keyString,
        hasKeyFromUrl,
        needsKey: !keyString && !rawDrop?.customKey,
        needsPassword: !keyString && rawDrop?.customKey,

        // Manual key input
        decryptionFailed,
        manualKeyInput,
        setManualKeyInput,
        manualKeyError,
        submitManualKey,

        // Password input
        password,
        setPassword,
        passwordError,
        submitPassword,

        // Download state
        downloading,
        downloadProgress,
        currentFile,

        downloadFile,
        downloadAll,

        // Utilities
        getTotalSize,
        canDownloadAsZip,
        formatBytes,
    };
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
