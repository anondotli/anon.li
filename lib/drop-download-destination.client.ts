"use client"

/**
 * Blob downloads require the browser to hold the complete plaintext file in
 * memory. Keep that fallback deliberately small; larger files must have a
 * streaming destination before the server is asked to authorize a download.
 */
export const MAX_IN_MEMORY_DOWNLOAD_SIZE = 100 * 1024 * 1024

const DOWNLOAD_URL_LIFETIME_MS = 10 * 60 * 1000
const STALE_OPFS_FILE_AGE_MS = 24 * 60 * 60 * 1000
const TEMPORARY_FILE_PREFIX = ".anon-li-download-"

interface SaveFilePickerWindow extends Window {
    showSaveFilePicker?: (options?: {
        suggestedName?: string
    }) => Promise<{
        createWritable: () => Promise<WritableStream<Uint8Array>>
    }>
}

export interface PreparedDownloadDestination {
    readonly kind: "file-system" | "opfs" | "memory"
    write: (chunk: Uint8Array) => Promise<void>
    complete: () => Promise<void>
    abort: (reason?: unknown) => Promise<void>
}

function isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === "AbortError"
}

function randomTemporaryName(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    const id = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
    return `${TEMPORARY_FILE_PREFIX}${id}`
}

async function cleanupStaleOpfsDownloads(root: FileSystemDirectoryHandle): Promise<void> {
    const cutoff = Date.now() - STALE_OPFS_FILE_AGE_MS
    try {
        for await (const entry of root.values()) {
            if (entry.kind && entry.kind !== "file") continue
            if (!entry.name.startsWith(TEMPORARY_FILE_PREFIX)) continue

            try {
                const file = await entry.getFile()
                if (file.lastModified >= cutoff) continue
                await root.removeEntry(entry.name)
            } catch {
                // Another tab may still own the entry, or it may already be gone.
            }
        }
    } catch {
        // Cleanup is best-effort and must never block a new download.
    }
}

function triggerBrowserDownload(blob: Blob, filename: string, cleanup?: () => void): void {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = filename
    anchor.style.display = "none"
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()

    // Keep the object URL and any OPFS backing file alive long enough for the
    // browser's download manager to take ownership, including for large files.
    globalThis.setTimeout(() => {
        URL.revokeObjectURL(url)
        cleanup?.()
    }, DOWNLOAD_URL_LIFETIME_MS)
}

function streamDestination(
    kind: PreparedDownloadDestination["kind"],
    writable: WritableStream<Uint8Array>,
): PreparedDownloadDestination {
    const writer = writable.getWriter()
    let settled = false

    return {
        kind,
        write: async (chunk) => {
            if (settled) throw new Error("Download destination is already closed")
            await writer.write(chunk)
        },
        complete: async () => {
            if (settled) return
            settled = true
            await writer.close()
        },
        abort: async (reason) => {
            if (settled) return
            settled = true
            try {
                await writer.abort(reason)
            } catch {
                // Preserve the original download error.
            }
        },
    }
}

async function prepareOpfsDestination(
    filename: string,
): Promise<PreparedDownloadDestination | null> {
    const storage = navigator.storage
    if (typeof storage?.getDirectory !== "function") return null

    let root: FileSystemDirectoryHandle | null = null
    let temporaryName: string | null = null

    try {
        const opfsRoot = await storage.getDirectory()
        root = opfsRoot
        await cleanupStaleOpfsDownloads(opfsRoot)

        const opfsTemporaryName = randomTemporaryName()
        temporaryName = opfsTemporaryName
        const fileHandle = await opfsRoot.getFileHandle(opfsTemporaryName, { create: true })
        const writable = await fileHandle.createWritable()
        const destination = streamDestination("opfs", writable)
        let removed = false

        const removeTemporaryFile = () => {
            if (removed) return
            removed = true
            void opfsRoot.removeEntry(opfsTemporaryName).catch(() => {
                // A later OPFS quota cleanup can remove an orphaned temp file.
            })
        }

        return {
            kind: "opfs",
            write: destination.write,
            complete: async () => {
                try {
                    await destination.complete()
                    const file = await fileHandle.getFile()
                    triggerBrowserDownload(file, filename, removeTemporaryFile)
                } catch (error) {
                    removeTemporaryFile()
                    throw error
                }
            },
            abort: async (reason) => {
                await destination.abort(reason)
                removeTemporaryFile()
            },
        }
    } catch {
        if (root && temporaryName) {
            void root.removeEntry(temporaryName).catch(() => {
                // Best-effort cleanup after destination preparation failed.
            })
        }
        // OPFS is commonly unavailable in private browsing or when storage is
        // denied. A small, explicitly bounded memory fallback may still work.
        return null
    }
}

function prepareMemoryDestination(filename: string): PreparedDownloadDestination {
    let chunks: Uint8Array[] = []
    let settled = false

    return {
        kind: "memory",
        write: async (chunk) => {
            if (settled) throw new Error("Download destination is already closed")
            chunks.push(chunk)
        },
        complete: async () => {
            if (settled) return
            settled = true
            const blob = new Blob(chunks as BlobPart[], { type: "application/octet-stream" })
            chunks = []
            triggerBrowserDownload(blob, filename)
        },
        abort: async () => {
            settled = true
            chunks = []
        },
    }
}

/**
 * Prepare a safe plaintext destination before authorizing a download.
 *
 * A null result means the user cancelled the native save picker. Other picker
 * failures fall back to OPFS and, only for small files, a bounded Blob.
 */
export async function prepareDownloadDestination(
    filename: string,
    size: number,
): Promise<PreparedDownloadDestination | null> {
    const saveFilePicker = (window as SaveFilePickerWindow).showSaveFilePicker
    if (saveFilePicker) {
        try {
            const handle = await saveFilePicker({ suggestedName: filename })
            const writable = await handle.createWritable()
            return streamDestination("file-system", writable)
        } catch (error) {
            if (isAbortError(error)) return null
        }
    }

    const opfsDestination = await prepareOpfsDestination(filename)
    if (opfsDestination) return opfsDestination

    if (size > MAX_IN_MEMORY_DOWNLOAD_SIZE) {
        throw new Error(
            "This browser cannot safely save this large file without loading it into memory. " +
            "Try a current browser with site storage enabled, then download again.",
        )
    }

    return prepareMemoryDestination(filename)
}
