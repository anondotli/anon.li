/**
 * @vitest-environment jsdom
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    createGuestDrop: vi.fn(),
    addFileToGuestDrop: vi.fn(),
    finishGuestDrop: vi.fn(),
    abortGuestFileUpload: vi.fn(),
    createDrop: vi.fn(),
    addFileToDrop: vi.fn(),
    uploadChunk: vi.fn(),
    finishDrop: vi.fn(),
    createEncryptionContext: vi.fn(),
    generateFileIv: vi.fn(),
    base64UrlToArrayBuffer: vi.fn(),
    encryptFilename: vi.fn(),
    encryptMessage: vi.fn(),
    encryptChunk: vi.fn(),
    encryptKeyWithPassword: vi.fn(),
    wrapDropKey: vi.fn(),
    wrapDropKeyForOrg: vi.fn(),
    extractStoredKeyMaterial: vi.fn(),
    upsertCachedWrappedDropKey: vi.fn(),
    fetch: vi.fn(),
    vault: { current: null as null | {
        status: "unlocked";
        vaultGeneration: number;
        vaultId: string;
        wrapDropKey: ReturnType<typeof vi.fn>;
        wrapDropKeyForOrg: ReturnType<typeof vi.fn>;
    } },
    onComplete: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
}))

vi.mock("sonner", () => ({
    toast: {
        error: mocks.toastError,
        success: mocks.toastSuccess,
        info: vi.fn(),
    },
}))

vi.mock("@/lib/drop.actions.guest", () => ({
    createGuestDrop: mocks.createGuestDrop,
    addFileToGuestDrop: mocks.addFileToGuestDrop,
    finishGuestDrop: mocks.finishGuestDrop,
    abortGuestFileUpload: mocks.abortGuestFileUpload,
}))

vi.mock("@/lib/drop.actions.client", () => ({
    createDrop: mocks.createDrop,
    addFileToDrop: mocks.addFileToDrop,
    uploadChunk: mocks.uploadChunk,
    finishDrop: mocks.finishDrop,
    UpgradeRequiredClientError: class UpgradeRequiredClientError extends Error {
        details = {}
    },
}))

vi.mock("@/lib/crypto.client", () => ({
    calculateEncryptedSize: (size: number) => size + 16,
    CryptoConfig: {
        getChunkParams: (size: number) => ({ chunkSize: size, chunkCount: 1 }),
        getConcurrency: () => 1,
    },
    cryptoService: {
        createEncryptionContext: mocks.createEncryptionContext,
        generateFileIv: mocks.generateFileIv,
        base64UrlToArrayBuffer: mocks.base64UrlToArrayBuffer,
        encryptFilename: mocks.encryptFilename,
        encryptMessage: mocks.encryptMessage,
        encryptChunk: mocks.encryptChunk,
        encryptKeyWithPassword: mocks.encryptKeyWithPassword,
    },
}))

vi.mock("@/components/vault/vault-provider", () => ({
    useOptionalVault: () => mocks.vault.current,
}))

vi.mock("@/lib/auth-client", () => ({
    authClient: {
        useActiveOrganization: () => ({ data: null }),
    },
}))

vi.mock("@/lib/vault/crypto", () => ({
    extractStoredKeyMaterial: mocks.extractStoredKeyMaterial,
}))

vi.mock("@/lib/vault/drop-keys-client", () => ({
    upsertCachedWrappedDropKey: mocks.upsertCachedWrappedDropKey,
}))

vi.mock("@/lib/analytics", () => ({
    analytics: {
        dropUploadStarted: vi.fn(),
        dropUploadCompleted: vi.fn(),
    },
}))

import { useDropUpload } from "@/hooks/use-drop-upload"

function unlockVault() {
    mocks.vault.current = {
        status: "unlocked",
        vaultGeneration: 7,
        vaultId: "vault-1",
        wrapDropKey: mocks.wrapDropKey,
        wrapDropKeyForOrg: mocks.wrapDropKeyForOrg,
    }
}

function dropDeletes() {
    return mocks.fetch.mock.calls.filter(([url, init]) =>
        url === "/api/v1/drop/auth-drop-1" && (init as RequestInit | undefined)?.method === "DELETE")
}

describe("useDropUpload abandoned-upload cleanup", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.stubGlobal("fetch", mocks.fetch)
        mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }))
        unlockVault()
        mocks.createEncryptionContext.mockResolvedValue({
            keyString: "share-key",
            dropIvString: "drop-iv",
            key: {},
            dropIv: new Uint8Array(12),
        })
        mocks.generateFileIv.mockReturnValue("file-iv")
        mocks.base64UrlToArrayBuffer.mockReturnValue(new ArrayBuffer(12))
        mocks.encryptFilename.mockResolvedValue("encrypted-name")
        mocks.encryptChunk.mockResolvedValue(new ArrayBuffer(21))
        mocks.extractStoredKeyMaterial.mockReturnValue("owner-key-material")
        mocks.wrapDropKey.mockResolvedValue("wrapped-owner-key")
        mocks.createDrop.mockResolvedValue({ dropId: "auth-drop-1", expiresAt: null })
        mocks.addFileToDrop.mockResolvedValue({
            fileId: "auth-file-1",
            s3UploadId: "auth-multipart-1",
            uploadUrls: { 1: "https://r2.example/auth-part-1" },
        })
        mocks.uploadChunk.mockResolvedValue("etag-1")
        mocks.finishDrop.mockResolvedValue(undefined)
    })

    afterEach(() => {
        cleanup()
        vi.unstubAllGlobals()
    })

    it("deletes the empty drop when an upload fails before finalization", async () => {
        mocks.uploadChunk.mockRejectedValueOnce(new Error("R2 unreachable"))
        const { result } = renderHook(() => useDropUpload({ guest: false }))

        act(() => result.current.setFiles([new File(["hello"], "hello.txt")]))
        await act(async () => {
            await result.current.upload()
        })

        await waitFor(() => expect(dropDeletes()).toHaveLength(1))
        expect(result.current.progress?.phase).toBe("error")
        expect(mocks.finishDrop).not.toHaveBeenCalled()
    })

    it("falls back to aborting each file when the drop delete is refused", async () => {
        mocks.fetch.mockImplementation(async (url: string, init?: RequestInit) =>
            url === "/api/v1/drop/auth-drop-1" && init?.method === "DELETE"
                ? new Response(JSON.stringify({ error: { message: "Forbidden" } }), { status: 403 })
                : new Response(JSON.stringify({ success: true }), { status: 200 }))
        mocks.uploadChunk.mockRejectedValueOnce(new Error("R2 unreachable"))
        const { result } = renderHook(() => useDropUpload({ guest: false }))

        act(() => result.current.setFiles([new File(["hello"], "hello.txt")]))
        await act(async () => {
            await result.current.upload()
        })

        await waitFor(() => expect(mocks.fetch).toHaveBeenCalledWith(
            "/api/v1/drop/auth-drop-1/file/auth-file-1",
            expect.objectContaining({
                method: "DELETE",
                body: JSON.stringify({ s3UploadId: "auth-multipart-1" }),
            }),
        ))
        expect(dropDeletes()).toHaveLength(1)
    })

    it("deletes a drop whose createDrop returned after the user cancelled", async () => {
        let resolveCreate!: (value: { dropId: string; expiresAt: null }) => void
        mocks.createDrop.mockImplementationOnce(() => new Promise((resolve) => {
            resolveCreate = resolve
        }))
        const { result } = renderHook(() => useDropUpload({ guest: false }))

        act(() => result.current.setFiles([new File(["hello"], "hello.txt")]))
        let uploading!: Promise<void>
        act(() => {
            uploading = result.current.upload()
        })
        await waitFor(() => expect(mocks.createDrop).toHaveBeenCalled())

        await act(async () => {
            await result.current.cancel()
        })
        // cancel() could not know the drop id yet.
        expect(dropDeletes()).toHaveLength(0)

        await act(async () => {
            resolveCreate({ dropId: "auth-drop-1", expiresAt: null })
            await uploading
        })

        await waitFor(() => expect(dropDeletes()).toHaveLength(1))
        expect(mocks.addFileToDrop).not.toHaveBeenCalled()
    })

    it("deletes the drop when addFile returns after the user cancelled", async () => {
        let resolveAdd!: (value: unknown) => void
        mocks.addFileToDrop.mockImplementationOnce(() => new Promise((resolve) => {
            resolveAdd = resolve
        }))
        const { result } = renderHook(() => useDropUpload({ guest: false }))

        act(() => result.current.setFiles([new File(["hello"], "hello.txt")]))
        let uploading!: Promise<void>
        act(() => {
            uploading = result.current.upload()
        })
        await waitFor(() => expect(mocks.addFileToDrop).toHaveBeenCalled())

        await act(async () => {
            await result.current.cancel()
        })
        // cancel() already removes the drop (and with it the pending file).
        expect(dropDeletes()).toHaveLength(1)

        await act(async () => {
            resolveAdd({
                fileId: "late-file",
                s3UploadId: "late-multipart",
                uploadUrls: { 1: "https://r2.example/late" },
            })
            await uploading
        })

        // The late reservation is aborted too, and no chunk is uploaded.
        await waitFor(() => expect(mocks.fetch).toHaveBeenCalledWith(
            "/api/v1/drop/auth-drop-1/file/late-file",
            expect.objectContaining({ method: "DELETE" }),
        ))
        expect(mocks.uploadChunk).not.toHaveBeenCalled()
    })

    it("aborts and discards an in-flight upload when the component unmounts", async () => {
        mocks.uploadChunk.mockImplementationOnce((_url: string, _data: ArrayBuffer, signal: AbortSignal) =>
            new Promise((_resolve, reject) => {
                signal.addEventListener("abort", () => reject(new Error("aborted")))
            }))
        const { result, unmount } = renderHook(() => useDropUpload({ guest: false }))

        act(() => result.current.setFiles([new File(["hello"], "hello.txt")]))
        let uploading!: Promise<void>
        act(() => {
            uploading = result.current.upload()
        })
        await waitFor(() => expect(mocks.uploadChunk).toHaveBeenCalled())

        unmount()
        await uploading

        await waitFor(() => expect(dropDeletes()).toHaveLength(1))
        expect(mocks.finishDrop).not.toHaveBeenCalled()
        expect(mocks.toastError).not.toHaveBeenCalled()
    })
})
