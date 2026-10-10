import { useState, useEffect, useCallback, useRef } from "react";
import { cryptoService } from "@/lib/crypto.client";
import { getDrop, recordDownload, type DropMetadata } from "@/lib/drop.actions.client";
import { MAX_ZIP_SIZE, MIN_CHUNK_SIZE, AUTH_TAG_SIZE } from "@/lib/constants";
import { normalizeDropKeyInput, parseDropShareFragment } from "@/lib/drop-link";
import { formatBytes } from "@/lib/format";
import { plaintextSizeFromEncrypted } from "@/lib/drop-size";
import {
    sanitizeArchivePath,
    sanitizeDownloadFilename,
    uniqueArchivePath,
} from "@/lib/download-filename";
import { fetchAuthorizedDropFile } from "@/lib/drop-download.client";
import {
    MAX_IN_MEMORY_DOWNLOAD_SIZE,
    prepareDownloadDestination,
    type PreparedDownloadDestination,
} from "@/lib/drop-download-destination.client";

const MAX_SAFE_ZIP_SIZE = Math.min(MAX_ZIP_SIZE, MAX_IN_MEMORY_DOWNLOAD_SIZE);

interface DecryptedFile {
    id: string;
    encryptedName: string;
    decryptedName: string;
    /** Original plaintext bytes shown to the recipient. */
    size: number;
    /** Stored ciphertext bytes, including one AES-GCM tag per chunk. */
    encryptedSize: number;
    mimeType: string;
    iv: string;
    chunkSize: number;
    chunkCount: number;
}

/**
 * Start every presigned R2 request immediately. Download-limited drops get
 * short-lived URLs (LIMITED_DROP_PRESIGNED_URL_EXPIRES) that only need to
 * *begin* before they expire; fetching them one after another would let later
 * URLs lapse on slow links after the single allowance was already spent.
 * Bodies may then be consumed in any order.
 */
function startAuthorizedFetches(
    files: readonly DecryptedFile[],
    downloadUrls: Record<string, string>,
    signal: AbortSignal,
): Map<string, Promise<Response>> {
    const responses = new Map<string, Promise<Response>>();
    for (const file of files) {
        const downloadUrl = downloadUrls[file.id];
        if (!downloadUrl) {
            throw new Error(`Missing download URL for ${file.decryptedName}`);
        }
        const response = fetch(downloadUrl, {
            credentials: "omit",
            referrerPolicy: "no-referrer",
            signal,
        }).then((res) => {
            if (!res.ok) throw new Error(`Failed to download ${file.decryptedName}`);
            return res;
        });
        // Rejections are observed when each body is consumed; don't let an
        // early failure surface as an unhandled rejection in the meantime.
        response.catch(() => undefined);
        responses.set(file.id, response);
    }
    return responses;
}

interface DirectoryPickerWindow extends Window {
    showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
}

function isAbortError(error: unknown): boolean {
    // DOMException is not an Error subclass in every runtime; match by name.
    return typeof error === "object" && error !== null
        && (error as { name?: unknown }).name === "AbortError";
}

async function directoryEntryExists(directory: FileSystemDirectoryHandle, name: string): Promise<boolean> {
    try {
        await directory.getFileHandle(name);
        return true;
    } catch {
        return false;
    }
}

/**
 * Let the recipient choose ONE folder and stream every file into it. Calling
 * showSaveFilePicker once per file fails in Chromium after the first dialog
 * because each picker needs its own user activation.
 *
 * Returns null when the user cancels, undefined when the API is unavailable or
 * fails (callers fall back to per-file destinations). Existing files in the
 * folder are never overwritten: colliding names get a numbered suffix.
 */
async function prepareDirectoryDestinations(
    files: readonly DecryptedFile[],
): Promise<Map<string, PreparedDownloadDestination> | null | undefined> {
    const showDirectoryPicker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (typeof showDirectoryPicker !== "function") return undefined;

    let directory: FileSystemDirectoryHandle;
    try {
        directory = await showDirectoryPicker.call(window, { mode: "readwrite" });
    } catch (error) {
        return isAbortError(error) ? null : undefined;
    }

    const destinations = new Map<string, PreparedDownloadDestination>();
    const createdNames: string[] = [];
    try {
        const usedNames = new Set<string>();
        for (const file of files) {
            const baseName = sanitizeDownloadFilename(file.decryptedName);
            let name = uniqueArchivePath(baseName, usedNames);
            while (await directoryEntryExists(directory, name)) {
                // Every earlier candidate is in usedNames, so this yields the
                // next numbered variant of the original name.
                name = uniqueArchivePath(baseName, usedNames);
            }
            const handle = await directory.getFileHandle(name, { create: true });
            createdNames.push(name);
            const writer = (await handle.createWritable()).getWriter();
            const createdName = name;
            let settled = false;
            destinations.set(file.id, {
                kind: "file-system",
                write: async (chunk) => {
                    if (settled) throw new Error("Download destination is already closed");
                    await writer.write(chunk);
                },
                complete: async () => {
                    if (settled) return;
                    settled = true;
                    await writer.close();
                },
                abort: async (reason) => {
                    if (settled) return;
                    settled = true;
                    await writer.abort(reason).catch(() => undefined);
                    // Don't leave an empty placeholder file behind.
                    await directory.removeEntry(createdName).catch(() => undefined);
                },
            });
        }
        return destinations;
    } catch {
        await Promise.allSettled(Array.from(destinations.values(), (destination) => destination.abort()));
        await Promise.allSettled(createdNames.map((name) => directory.removeEntry(name)));
        return undefined;
    }
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
    // Per-recipient bearer token from the URL fragment. Legacy `?r=` links are
    // accepted and immediately scrubbed from the address bar after reading.
    const [recipientToken, setRecipientToken] = useState<string | null>(null);
    const [manualKeyInput, setManualKeyInput] = useState("");
    const [manualKeyError, setManualKeyError] = useState<string | null>(null);

    const [decryptionFailed, setDecryptionFailed] = useState(false);

    const [password, setPassword] = useState("");
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [submittingPassword, setSubmittingPassword] = useState(false);
    const passwordSubmitInFlightRef = useRef(false);

    const [downloading, setDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [currentFile, setCurrentFile] = useState<string | null>(null);
    const [downloadError, setDownloadError] = useState<string | null>(null);
    const downloadInProgressRef = useRef(false);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            const parsedFragment = parseDropShareFragment(window.location.hash);
            if (parsedFragment.key) {
                setKeyString(parsedFragment.key);
                setHasKeyFromUrl(true);
            }

            if (parsedFragment.recipientToken) {
                setRecipientToken(parsedFragment.recipientToken);
                return;
            }

            const url = new URL(window.location.href);
            const legacyRecipientToken = url.searchParams.get("r");
            if (legacyRecipientToken) {
                setRecipientToken(legacyRecipientToken);
                url.searchParams.delete("r");
                window.history.replaceState(
                    window.history.state,
                    "",
                    `${url.pathname}${url.search}${url.hash}`,
                );
            }
        }, 0);

        return () => {
            window.clearTimeout(timer);
        };
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
                            const encryptedSize = Number(file.size);
                            const chunkSize = file.chunkSize ?? MIN_CHUNK_SIZE;
                            const chunkCount = file.chunkCount
                                ?? Math.ceil(encryptedSize / (chunkSize + AUTH_TAG_SIZE));
                            const size = plaintextSizeFromEncrypted(encryptedSize, chunkCount);
                            if (
                                !Number.isSafeInteger(encryptedSize)
                                || !Number.isSafeInteger(chunkSize)
                                || !Number.isSafeInteger(chunkCount)
                                || size < 1
                                || chunkSize < 1
                                || chunkCount < 1
                            ) {
                                throw new Error("Invalid encrypted file metadata");
                            }

                            const fileIv = new Uint8Array(cryptoService.base64UrlToArrayBuffer(file.iv));
                            const decryptedName = await cryptoService.decryptFilename(file.encryptedName, key, fileIv);
                            return {
                                id: file.id,
                                encryptedName: file.encryptedName,
                                decryptedName,
                                size,
                                encryptedSize,
                                mimeType: file.mimeType,
                                iv: file.iv,
                                chunkSize,
                                chunkCount,
                            };
                        } catch {
                            decryptFailures++;
                            return {
                                id: file.id,
                                encryptedName: file.encryptedName,
                                decryptedName: `File ${file.id}`,
                                size: 0,
                                encryptedSize: 0,
                                mimeType: file.mimeType,
                                iv: file.iv,
                                chunkSize: file.chunkSize ?? MIN_CHUNK_SIZE,
                                chunkCount: file.chunkCount ?? 1,
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
                        message = await cryptoService.decryptMessage(rawDrop.encryptedMessage, key, dropIv);
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
        // Argon2 derivation is deliberately expensive; ignore repeat submits
        // instead of running parallel derivations.
        if (passwordSubmitInFlightRef.current) return;
        passwordSubmitInFlightRef.current = true;
        setSubmittingPassword(true);

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
        } finally {
            passwordSubmitInFlightRef.current = false;
            setSubmittingPassword(false);
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
        if (downloadInProgressRef.current) return;

        const file = drop.files.find(f => f.id === fileId);
        if (!file) return;

        downloadInProgressRef.current = true;
        setDownloadError(null);
        let destination: PreparedDownloadDestination | null = null;

        try {
            const safeFilename = sanitizeDownloadFilename(file.decryptedName);

            // The save picker (or a safe local fallback) must be ready before
            // authorization, because authorization may consume a limited
            // download. Cancelling the picker therefore costs nothing.
            destination = await prepareDownloadDestination(safeFilename, file.size);
            if (!destination) return;

            setDownloading(true);
            setDownloadProgress(0);
            setCurrentFile(file.decryptedName);

            const key = await cryptoService.importKey(keyString);
            const iv = new Uint8Array(cryptoService.base64UrlToArrayBuffer(file.iv));

            const response = await fetchAuthorizedDropFile(dropId, fileId, {
                recipientToken,
            });
            if (!response.ok) {
                throw new Error("Storage failed to serve this file");
            }

            if (!response.body) throw new Error("ReadableStream not supported in this browser");

            const decryptionStream = cryptoService.createDecryptionStream(key, iv, file.chunkSize, {
                encryptedSize: file.encryptedSize,
                chunkCount: file.chunkCount,
            });
            const decryptedStream = response.body.pipeThrough(decryptionStream);

            const reader = decryptedStream.getReader();
            let receivedLength = 0;
            const totalSize = file.size;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                await destination.write(value);
                receivedLength += value.length;

                setDownloadProgress(Math.min(99, Math.round((receivedLength / totalSize) * 100)));
            }

            await destination.complete();
            destination = null;
            setDownloadProgress(100);
        } catch (err) {
            await destination?.abort(err);
            setDownloadError(err instanceof Error ? err.message : "Download failed");
        } finally {
            downloadInProgressRef.current = false;
            setDownloading(false);
            setCurrentFile(null);
            setDownloadProgress(0);
        }
    }, [drop, keyString, dropId, recipientToken]);

    // Globally capped drops and recipient links have an allowance that each
    // per-file authorization spends; whole-drop downloads spend it once.
    const isLimitedDrop = Boolean(drop && (drop.maxDownloads !== null || recipientToken !== null));

    // Download every file as its own plaintext file under ONE whole-drop
    // authorization. Used when the drop is too large for an in-browser ZIP.
    const downloadAllSeparately = useCallback(async () => {
        if (!drop || !keyString || drop.files.length === 0) return;
        if (downloadInProgressRef.current) return;

        downloadInProgressRef.current = true;
        setDownloadError(null);
        const destinations = new Map<string, PreparedDownloadDestination>();
        const fetchController = new AbortController();

        try {
            // Prepare every destination before authorizing, so cancelling any
            // save dialog costs nothing. Prefer one folder picker over a save
            // dialog per file.
            const directoryDestinations = await prepareDirectoryDestinations(drop.files);
            if (directoryDestinations === null) return;
            if (directoryDestinations) {
                for (const [fileId, destination] of directoryDestinations) {
                    destinations.set(fileId, destination);
                }
            } else {
                const usedNames = new Set<string>();
                let inMemoryBytes = 0;
                for (const file of drop.files) {
                    const filename = uniqueArchivePath(sanitizeDownloadFilename(file.decryptedName), usedNames);
                    const destination = await prepareDownloadDestination(filename, file.size);
                    if (!destination) {
                        for (const prepared of destinations.values()) await prepared.abort();
                        destinations.clear();
                        return;
                    }
                    destinations.set(file.id, destination);
                    // Each memory fallback is individually bounded, but the
                    // batch holds all of them at once. Refuse before the single
                    // allowance is spent rather than running out of memory.
                    if (destination.kind === "memory") {
                        inMemoryBytes += file.size;
                        if (inMemoryBytes > MAX_IN_MEMORY_DOWNLOAD_SIZE) {
                            throw new Error(
                                "This browser cannot safely save these files without loading them all into memory. " +
                                "Try a current browser with site storage enabled, then download again.",
                            );
                        }
                    }
                }
            }

            setDownloading(true);
            setDownloadProgress(0);
            setCurrentFile("Preparing download...");

            const downloadUrls = await recordDownload(dropId, recipientToken ?? undefined);
            const responses = startAuthorizedFetches(drop.files, downloadUrls, fetchController.signal);

            const key = await cryptoService.importKey(keyString);
            const totalSize = drop.files.reduce((sum, f) => sum + f.size, 0);
            let receivedLength = 0;
            setCurrentFile(`Downloading ${drop.files.length} files...`);

            // Drain every body concurrently so no started transfer stalls
            // behind another file while its connection sits idle.
            await Promise.all(drop.files.map(async (file) => {
                const destination = destinations.get(file.id)!;
                const response = await responses.get(file.id)!;
                if (!response.body) throw new Error("ReadableStream not supported in this browser");

                const iv = new Uint8Array(cryptoService.base64UrlToArrayBuffer(file.iv));
                const reader = response.body
                    .pipeThrough(cryptoService.createDecryptionStream(key, iv, file.chunkSize, {
                        encryptedSize: file.encryptedSize,
                        chunkCount: file.chunkCount,
                    }))
                    .getReader();

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    await destination.write(value);
                    receivedLength += value.length;
                    setDownloadProgress(Math.min(99, Math.round((receivedLength / totalSize) * 100)));
                }

                await destination.complete();
                destinations.delete(file.id);
            }));

            setDownloadProgress(100);
        } catch (err) {
            fetchController.abort();
            await Promise.allSettled(
                Array.from(destinations.values(), (destination) => destination.abort(err)),
            );
            setDownloadError(err instanceof Error ? err.message : "Download failed");
        } finally {
            downloadInProgressRef.current = false;
            setDownloading(false);
            setCurrentFile(null);
            setDownloadProgress(0);
        }
    }, [drop, keyString, dropId, recipientToken]);

    // Download all files as ZIP
    const downloadAll = useCallback(async () => {
        if (!drop || !keyString || drop.files.length === 0) return;

        // Single file - just download directly
        if (drop.files.length === 1 && drop.files[0]) {
            return downloadFile(drop.files[0].id);
        }

        if (downloadInProgressRef.current) return;

        const totalSize = drop.files.reduce((sum, f) => sum + f.size, 0);

        // Too large for an in-browser ZIP. Download-limited drops still need a
        // single whole-drop authorization (per-file downloads would each spend
        // the allowance), so save every file separately from one batch grant.
        if (totalSize > MAX_SAFE_ZIP_SIZE) {
            if (isLimitedDrop) return downloadAllSeparately();
            return;
        }

        downloadInProgressRef.current = true;
        setDownloadError(null);
        let destination: PreparedDownloadDestination | null = null;
        const fetchController = new AbortController();

        try {
            const safeTitle = drop.title
                ? drop.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 200)
                : null;
            const downloadName = safeTitle ? `${safeTitle}.zip` : "anon-li-drop.zip";

            destination = await prepareDownloadDestination(downloadName, totalSize);
            if (!destination) return;

            setDownloading(true);
            setDownloadProgress(0);
            setCurrentFile("Preparing download...");

            // Record download and get signed URLs
            const downloadUrls = await recordDownload(dropId, recipientToken ?? undefined);
            const responses = startAuthorizedFetches(drop.files, downloadUrls, fetchController.signal);

            const key = await cryptoService.importKey(keyString);
            const zipFiles: { [key: string]: Uint8Array } = {};
            const usedArchivePaths = new Set<string>();

            for (let i = 0; i < drop.files.length; i++) {
                const file = drop.files[i];
                if (!file) continue;

                setCurrentFile(`Downloading ${file.decryptedName}...`);
                setDownloadProgress(Math.round((i / drop.files.length) * 80));

                const iv = new Uint8Array(cryptoService.base64UrlToArrayBuffer(file.iv));

                // Read this file's (already started) response, then decrypt
                const response = await responses.get(file.id)!;

                const encryptedData = await response.arrayBuffer();
                if (encryptedData.byteLength !== file.encryptedSize) {
                    throw new Error(`Encrypted file size mismatch for ${file.decryptedName}`);
                }
                const totalEncryptedSize = encryptedData.byteLength;

                const encryptedChunkSize = file.chunkSize + AUTH_TAG_SIZE;

                const decryptedChunks: ArrayBuffer[] = [];
                for (let j = 0; j < file.chunkCount; j++) {
                    const start = j * encryptedChunkSize;
                    const end = Math.min(start + encryptedChunkSize, totalEncryptedSize);
                    const chunk = encryptedData.slice(start, end);
                    const decrypted = await cryptoService.decryptChunk(chunk, key, iv, j);
                    decryptedChunks.push(decrypted);
                }

                // Combine
                const totalDecryptedSize = decryptedChunks.reduce((sum, c) => sum + c.byteLength, 0);
                if (totalDecryptedSize !== file.size) {
                    throw new Error(`Decrypted file size mismatch for ${file.decryptedName}`);
                }
                const combined = new Uint8Array(totalDecryptedSize);
                let offset = 0;
                for (const chunk of decryptedChunks) {
                    combined.set(new Uint8Array(chunk), offset);
                    offset += chunk.byteLength;
                }

                const archivePath = uniqueArchivePath(
                    sanitizeArchivePath(file.decryptedName),
                    usedArchivePaths,
                );
                zipFiles[archivePath] = combined;
            }

            setCurrentFile("Creating ZIP archive...");
            setDownloadProgress(85);

            const { zipSync } = await import("fflate");
            const zipped = zipSync(zipFiles);

            setCurrentFile("Downloading...");
            setDownloadProgress(95);

            await destination.write(zipped);
            await destination.complete();
            destination = null;

            setDownloadProgress(100);

        } catch (err) {
            fetchController.abort();
            await destination?.abort(err);
            setDownloadError(err instanceof Error ? err.message : "Failed to create ZIP");
        } finally {
            downloadInProgressRef.current = false;
            setDownloading(false);
            setCurrentFile(null);
            setDownloadProgress(0);
        }
    }, [drop, keyString, downloadFile, dropId, recipientToken, isLimitedDrop, downloadAllSeparately]);

    // Utility functions
    const getTotalSize = useCallback(() => {
        if (!drop) return 0;
        return drop.files.reduce((sum, f) => sum + f.size, 0);
    }, [drop]);

    const canDownloadAsZip = useCallback(() => {
        // fflate's synchronous ZIP builder retains plaintext and archive data
        // in memory. Keep that path inside the same conservative memory bound.
        return getTotalSize() <= MAX_SAFE_ZIP_SIZE;
    }, [getTotalSize]);

    return {
        drop,
        loading,
        error,
        setError,

        // Key state
        keyString,
        hasKeyFromUrl,
        recipientToken,
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
        submittingPassword,

        // Download state
        downloading,
        downloadProgress,
        currentFile,
        downloadError,
        clearDownloadError: () => setDownloadError(null),

        downloadFile,
        downloadAll,

        // Utilities
        getTotalSize,
        canDownloadAsZip: canDownloadAsZip(),
        // Limited drops too large to ZIP can still be fetched whole (as
        // separate files) under one download authorization.
        canDownloadAllSeparately: isLimitedDrop && !canDownloadAsZip(),
        isLimitedDrop,
        formatBytes,
    };
}
