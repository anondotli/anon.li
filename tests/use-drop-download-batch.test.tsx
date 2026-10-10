/**
 * @vitest-environment jsdom
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useDropDownload } from "@/hooks/use-drop-download"
import type { DropMetadata } from "@/lib/drop.actions.client"

const mocks = vi.hoisted(() => ({
    prepareDestination: vi.fn(),
    fetchAuthorizedFile: vi.fn(),
    recordDownload: vi.fn(),
    decryptFilename: vi.fn(),
    decryptChunk: vi.fn(),
    decryptKeyWithPassword: vi.fn(),
    fetch: vi.fn(),
}))

vi.mock("@/lib/drop-download-destination.client", () => ({
    MAX_IN_MEMORY_DOWNLOAD_SIZE: 100 * 1024 * 1024,
    prepareDownloadDestination: mocks.prepareDestination,
}))

vi.mock("@/lib/drop-download.client", () => ({
    fetchAuthorizedDropFile: mocks.fetchAuthorizedFile,
}))

vi.mock("@/lib/drop.actions.client", () => ({
    getDrop: vi.fn(),
    recordDownload: mocks.recordDownload,
}))

vi.mock("@/lib/crypto.client", () => ({
    cryptoService: {
        importKey: vi.fn().mockResolvedValue({}),
        base64UrlToArrayBuffer: vi.fn().mockReturnValue(new Uint8Array(12).buffer),
        decryptFilename: mocks.decryptFilename,
        decryptMessage: vi.fn(),
        decryptChunk: mocks.decryptChunk,
        decryptKeyWithPassword: mocks.decryptKeyWithPassword,
        createDecryptionStream: vi.fn().mockImplementation(() => new TransformStream({
            transform(chunk, controller) {
                controller.enqueue(chunk)
            },
        })),
    },
}))

const urlKey = "k".repeat(43)

function dropWith(files: { id: string; size: string }[], overrides: Partial<DropMetadata> = {}): DropMetadata {
    return {
        id: "drop-1",
        encryptedTitle: null,
        encryptedMessage: null,
        iv: "drop-iv",
        customKey: false,
        salt: null,
        customKeyData: null,
        customKeyIv: null,
        downloads: 0,
        maxDownloads: 1,
        expiresAt: null,
        hideBranding: true,
        createdAt: new Date(0).toISOString(),
        files: files.map((file) => ({
            id: file.id,
            encryptedName: `encrypted-${file.id}`,
            size: file.size,
            mimeType: "application/octet-stream",
            iv: "file-iv",
            chunkSize: Number(file.size) - 16,
            chunkCount: 1,
        })),
        ...overrides,
    }
}

function destination(kind: "memory" | "opfs" | "file-system" = "memory") {
    return {
        kind,
        write: vi.fn().mockResolvedValue(undefined),
        complete: vi.fn().mockResolvedValue(undefined),
        abort: vi.fn().mockResolvedValue(undefined),
    }
}

/** fetch() stub whose responses stay pending until released. */
function deferredFetch(bodyFor: (url: string) => Uint8Array<ArrayBuffer>) {
    const releases: (() => void)[] = []
    mocks.fetch.mockImplementation((url: string) => new Promise<Response>((resolve) => {
        releases.push(() => resolve(new Response(bodyFor(url), { status: 200 })))
    }))
    return () => releases.forEach((release) => release())
}

beforeEach(() => {
    window.history.replaceState({}, "", `/d/drop-1#${urlKey}`)
    vi.stubGlobal("fetch", mocks.fetch)
    mocks.prepareDestination.mockReset()
    mocks.fetchAuthorizedFile.mockReset()
    mocks.recordDownload.mockReset()
    mocks.fetch.mockReset()
    mocks.decryptChunk.mockReset().mockImplementation(async (chunk: ArrayBuffer) => chunk.slice(16))
    mocks.decryptKeyWithPassword.mockReset()
    mocks.decryptFilename.mockReset().mockImplementation(async (name: string) => `${name}.bin`)
})

afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    window.history.replaceState({}, "", "/")
})

describe("useDropDownload whole-drop downloads", () => {
    it("starts every short-lived ZIP URL fetch before reading any body", async () => {
        const initialDrop = dropWith([
            { id: "a", size: "19" },
            { id: "b", size: "20" },
            { id: "c", size: "21" },
        ])
        const zipDestination = destination()
        mocks.prepareDestination.mockResolvedValue(zipDestination)
        mocks.recordDownload.mockResolvedValue({ a: "https://r2/a", b: "https://r2/b", c: "https://r2/c" })
        const sizes: Record<string, number> = { "https://r2/a": 19, "https://r2/b": 20, "https://r2/c": 21 }
        const release = deferredFetch((url) => new Uint8Array(sizes[url]!))

        const { result } = renderHook(() => useDropDownload({ dropId: "drop-1", initialDrop }))
        await waitFor(() => expect(result.current.drop?.files).toHaveLength(3))
        expect(result.current.canDownloadAsZip).toBe(true)

        let pending!: Promise<void>
        act(() => {
            pending = result.current.downloadAll() as Promise<void>
        })

        // All three requests are in flight while none has produced headers.
        await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(3))
        expect(mocks.decryptChunk).not.toHaveBeenCalled()

        release()
        await act(async () => {
            await pending
        })

        expect(mocks.recordDownload).toHaveBeenCalledOnce()
        expect(mocks.decryptChunk).toHaveBeenCalledTimes(3)
        expect(zipDestination.complete).toHaveBeenCalledOnce()
        expect(result.current.downloadError).toBeNull()
    })

    it("downloads a limited too-large-for-ZIP drop as separate files under one authorization", async () => {
        const MB = 1024 * 1024
        const initialDrop = dropWith([
            { id: "a", size: String(60 * MB + 16) },
            { id: "b", size: String(60 * MB + 16) },
        ])
        const [first, second] = [destination("opfs"), destination("opfs")]
        const destinations = [first, second]
        const calls: string[] = []
        mocks.prepareDestination.mockImplementation(async (name: string) => {
            calls.push(`prepare:${name}`)
            return destinations.shift()
        })
        mocks.recordDownload.mockImplementation(async () => {
            calls.push("authorize")
            return { a: "https://r2/a", b: "https://r2/b" }
        })
        const release = deferredFetch(() => new Uint8Array([1, 2, 3]))

        const { result } = renderHook(() => useDropDownload({ dropId: "drop-1", initialDrop }))
        await waitFor(() => expect(result.current.drop?.files).toHaveLength(2))
        expect(result.current.canDownloadAsZip).toBe(false)
        expect(result.current.canDownloadAllSeparately).toBe(true)

        let pending!: Promise<void>
        act(() => {
            pending = result.current.downloadAll() as Promise<void>
        })
        await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2))

        release()
        await act(async () => {
            await pending
        })

        expect(calls).toEqual(["prepare:encrypted-a.bin", "prepare:encrypted-b.bin", "authorize"])
        expect(mocks.recordDownload).toHaveBeenCalledOnce()
        // Per-file authorization would spend the allowance once per file.
        expect(mocks.fetchAuthorizedFile).not.toHaveBeenCalled()
        expect(first.complete).toHaveBeenCalledOnce()
        expect(second.complete).toHaveBeenCalledOnce()
        expect(result.current.downloadError).toBeNull()
    })

    it("spends nothing when a save dialog is cancelled and aborts already prepared files", async () => {
        const MB = 1024 * 1024
        const initialDrop = dropWith([
            { id: "a", size: String(60 * MB + 16) },
            { id: "b", size: String(60 * MB + 16) },
        ])
        const prepared = destination("opfs")
        mocks.prepareDestination.mockResolvedValueOnce(prepared).mockResolvedValueOnce(null)

        const { result } = renderHook(() => useDropDownload({ dropId: "drop-1", initialDrop }))
        await waitFor(() => expect(result.current.drop?.files).toHaveLength(2))

        await act(async () => {
            await result.current.downloadAll()
        })

        expect(mocks.recordDownload).not.toHaveBeenCalled()
        expect(prepared.abort).toHaveBeenCalledOnce()
    })

    it("refuses before spending the allowance when in-memory fallbacks exceed the batch budget", async () => {
        const MB = 1024 * 1024
        const initialDrop = dropWith([
            { id: "a", size: String(60 * MB + 16) },
            { id: "b", size: String(60 * MB + 16) },
        ])
        const [first, second] = [destination("memory"), destination("memory")]
        mocks.prepareDestination.mockResolvedValueOnce(first).mockResolvedValueOnce(second)

        const { result } = renderHook(() => useDropDownload({ dropId: "drop-1", initialDrop }))
        await waitFor(() => expect(result.current.drop?.files).toHaveLength(2))

        await act(async () => {
            await result.current.downloadAll()
        })

        expect(mocks.recordDownload).not.toHaveBeenCalled()
        expect(mocks.fetch).not.toHaveBeenCalled()
        expect(first.abort).toHaveBeenCalledOnce()
        expect(second.abort).toHaveBeenCalledOnce()
        expect(result.current.downloadError).toMatch(/without loading them all into memory/)
    })

    it("asks for one folder and writes every file into it without overwriting existing files", async () => {
        const MB = 1024 * 1024
        const initialDrop = dropWith([
            { id: "a", size: String(60 * MB + 16) },
            { id: "b", size: String(60 * MB + 16) },
        ])
        const existing = new Set(["encrypted-a.bin"])
        const written = new Map<string, number[]>()
        const closed: string[] = []
        const directory = {
            getFileHandle: vi.fn(async (name: string, options?: { create?: boolean }) => {
                if (!options?.create && !existing.has(name)) {
                    throw new DOMException("missing", "NotFoundError")
                }
                existing.add(name)
                return {
                    createWritable: async () => new WritableStream<Uint8Array>({
                        write(chunk) {
                            written.set(name, [...(written.get(name) ?? []), ...chunk])
                        },
                        close() {
                            closed.push(name)
                        },
                    }),
                }
            }),
            removeEntry: vi.fn().mockResolvedValue(undefined),
        }
        const showDirectoryPicker = vi.fn().mockResolvedValue(directory)
        vi.stubGlobal("showDirectoryPicker", showDirectoryPicker)
        mocks.recordDownload.mockResolvedValue({ a: "https://r2/a", b: "https://r2/b" })
        const release = deferredFetch((url) => new Uint8Array(url.endsWith("/a") ? [1] : [2, 2]))

        const { result } = renderHook(() => useDropDownload({ dropId: "drop-1", initialDrop }))
        await waitFor(() => expect(result.current.drop?.files).toHaveLength(2))

        let pending!: Promise<void>
        act(() => {
            pending = result.current.downloadAll() as Promise<void>
        })
        await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2))
        release()
        await act(async () => {
            await pending
        })

        expect(showDirectoryPicker).toHaveBeenCalledOnce()
        expect(mocks.prepareDestination).not.toHaveBeenCalled()
        expect(mocks.recordDownload).toHaveBeenCalledOnce()
        expect(written.get("encrypted-a (2).bin")).toEqual([1])
        expect(written.get("encrypted-b.bin")).toEqual([2, 2])
        expect(written.has("encrypted-a.bin")).toBe(false)
        expect(closed.sort()).toEqual(["encrypted-a (2).bin", "encrypted-b.bin"])
        expect(result.current.downloadError).toBeNull()
    })

    it("spends nothing when the folder picker is cancelled", async () => {
        const MB = 1024 * 1024
        const initialDrop = dropWith([
            { id: "a", size: String(60 * MB + 16) },
            { id: "b", size: String(60 * MB + 16) },
        ])
        vi.stubGlobal("showDirectoryPicker", vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError")))

        const { result } = renderHook(() => useDropDownload({ dropId: "drop-1", initialDrop }))
        await waitFor(() => expect(result.current.drop?.files).toHaveLength(2))

        await act(async () => {
            await result.current.downloadAll()
        })

        expect(mocks.prepareDestination).not.toHaveBeenCalled()
        expect(mocks.recordDownload).not.toHaveBeenCalled()
        expect(result.current.downloadError).toBeNull()
    })

    it("falls back to per-file destinations when the folder picker is unusable", async () => {
        const MB = 1024 * 1024
        const initialDrop = dropWith([
            { id: "a", size: String(60 * MB + 16) },
            { id: "b", size: String(60 * MB + 16) },
        ])
        vi.stubGlobal("showDirectoryPicker", vi.fn().mockRejectedValue(new DOMException("blocked", "SecurityError")))
        mocks.prepareDestination.mockResolvedValueOnce(destination("opfs")).mockResolvedValueOnce(null)

        const { result } = renderHook(() => useDropDownload({ dropId: "drop-1", initialDrop }))
        await waitFor(() => expect(result.current.drop?.files).toHaveLength(2))

        await act(async () => {
            await result.current.downloadAll()
        })

        expect(mocks.prepareDestination).toHaveBeenCalledTimes(2)
        expect(mocks.recordDownload).not.toHaveBeenCalled()
    })

    it("does not offer the batch path for unlimited drops", async () => {
        const MB = 1024 * 1024
        const initialDrop = dropWith([
            { id: "a", size: String(60 * MB + 16) },
            { id: "b", size: String(60 * MB + 16) },
        ], { maxDownloads: null })

        const { result } = renderHook(() => useDropDownload({ dropId: "drop-1", initialDrop }))
        await waitFor(() => expect(result.current.drop?.files).toHaveLength(2))

        expect(result.current.canDownloadAllSeparately).toBe(false)
        expect(result.current.isLimitedDrop).toBe(false)
    })
})

describe("useDropDownload password submission", () => {
    it("exposes a submitting state and ignores repeat submits during key derivation", async () => {
        window.history.replaceState({}, "", "/d/drop-1")
        const initialDrop = dropWith([{ id: "a", size: "19" }], {
            customKey: true,
            salt: "salt",
            customKeyData: "wrapped",
            customKeyIv: "iv",
        })
        let finish!: (key: string) => void
        mocks.decryptKeyWithPassword.mockImplementation(() => new Promise<string>((resolve) => {
            finish = resolve
        }))

        const { result } = renderHook(() => useDropDownload({ dropId: "drop-1", initialDrop }))
        await waitFor(() => expect(result.current.needsPassword).toBe(true))
        act(() => result.current.setPassword("correct horse"))

        act(() => {
            void result.current.submitPassword()
        })
        await waitFor(() => expect(result.current.submittingPassword).toBe(true))
        act(() => {
            void result.current.submitPassword()
        })
        expect(mocks.decryptKeyWithPassword).toHaveBeenCalledOnce()

        await act(async () => {
            finish(urlKey)
        })
        await waitFor(() => expect(result.current.submittingPassword).toBe(false))
        expect(result.current.keyString).toBe(urlKey)
    })
})
