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
    destinationWrite: vi.fn(),
    destinationComplete: vi.fn(),
    destinationAbort: vi.fn(),
    decryptFilename: vi.fn(),
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
    recordDownload: vi.fn(),
}))

vi.mock("@/lib/crypto.client", () => ({
    cryptoService: {
        importKey: vi.fn().mockResolvedValue({}),
        base64UrlToArrayBuffer: vi.fn().mockReturnValue(new Uint8Array(12).buffer),
        decryptFilename: mocks.decryptFilename,
        decryptMessage: vi.fn(),
        createDecryptionStream: vi.fn().mockImplementation(() => new TransformStream({
            transform(chunk, controller) {
                controller.enqueue(chunk)
            },
        })),
    },
}))

const initialDrop: DropMetadata = {
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
    files: [{
        id: "file-1",
        encryptedName: "encrypted-name",
        size: "3",
        mimeType: "application/octet-stream",
        iv: "file-iv",
        chunkSize: 3,
        chunkCount: 1,
    }],
}

const urlKey = "k".repeat(43)
const recipientToken = "r".repeat(43)

beforeEach(() => {
    window.history.replaceState({}, "", `/d/drop-1#${urlKey}`)
    mocks.prepareDestination.mockReset()
    mocks.fetchAuthorizedFile.mockReset()
    mocks.destinationWrite.mockReset().mockResolvedValue(undefined)
    mocks.destinationComplete.mockReset().mockResolvedValue(undefined)
    mocks.destinationAbort.mockReset().mockResolvedValue(undefined)
    mocks.decryptFilename.mockReset().mockResolvedValue("report.bin")
})

afterEach(() => {
    cleanup()
    window.history.replaceState({}, "", "/")
})

async function renderReadyDownloadHook() {
    const hook = renderHook(() => useDropDownload({ dropId: "drop-1", initialDrop }))
    await waitFor(() => expect(hook.result.current.drop?.files[0]?.decryptedName).toBe("report.bin"))
    return hook
}

describe("useDropDownload", () => {
    it("reads structured recipient fragments without exposing bearer material in the query", async () => {
        window.history.replaceState({}, "", `/d/drop-1#k=${urlKey}&r=${recipientToken}`)

        const { result } = await renderReadyDownloadHook()

        expect(result.current.keyString).toBe(urlKey)
        expect(result.current.recipientToken).toBe(recipientToken)
        expect(window.location.search).toBe("")
    })

    it("accepts legacy query tokens and scrubs them after reading", async () => {
        window.history.replaceState({}, "", `/d/drop-1?r=${recipientToken}#${urlKey}`)

        const { result } = await renderReadyDownloadHook()
        await waitFor(() => expect(result.current.recipientToken).toBe(recipientToken))

        expect(window.location.search).toBe("")
        expect(window.location.hash).toBe(`#${urlKey}`)
    })

    it("prepares the destination before requesting download authorization", async () => {
        const calls: string[] = []
        mocks.prepareDestination.mockImplementation(async () => {
            calls.push("prepare")
            return {
                kind: "memory",
                write: mocks.destinationWrite,
                complete: mocks.destinationComplete,
                abort: mocks.destinationAbort,
            }
        })
        mocks.fetchAuthorizedFile.mockImplementation(async () => {
            calls.push("authorize")
            return new Response(new Uint8Array([1, 2, 3]), { status: 200 })
        })

        const { result } = await renderReadyDownloadHook()
        await act(async () => {
            await result.current.downloadFile("file-1")
        })

        expect(calls).toEqual(["prepare", "authorize"])
        expect(mocks.destinationComplete).toHaveBeenCalledOnce()
        expect(result.current.downloadError).toBeNull()
    })

    it("does not authorize a cancelled save and keeps later errors recoverable", async () => {
        mocks.prepareDestination.mockResolvedValueOnce(null)
        const { result } = await renderReadyDownloadHook()

        await act(async () => {
            await result.current.downloadFile("file-1")
        })
        expect(mocks.fetchAuthorizedFile).not.toHaveBeenCalled()
        expect(result.current.error).toBeNull()

        mocks.prepareDestination.mockResolvedValueOnce({
            kind: "memory",
            write: mocks.destinationWrite,
            complete: mocks.destinationComplete,
            abort: mocks.destinationAbort,
        })
        mocks.fetchAuthorizedFile.mockRejectedValueOnce(new Error("Temporary network failure"))

        await act(async () => {
            await result.current.downloadFile("file-1")
        })

        expect(result.current.error).toBeNull()
        expect(result.current.downloadError).toBe("Temporary network failure")
        expect(result.current.drop).not.toBeNull()
        expect(mocks.destinationAbort).toHaveBeenCalledOnce()
    })
})
