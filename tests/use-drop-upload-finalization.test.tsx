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

describe("useDropUpload finalization retry", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.stubGlobal("fetch", mocks.fetch)
        mocks.vault.current = null
        mocks.createEncryptionContext.mockResolvedValue({
            keyString: "share-key",
            dropIvString: "drop-iv",
            key: {},
            dropIv: new Uint8Array(12),
        })
        mocks.generateFileIv.mockReturnValue("file-iv")
        mocks.base64UrlToArrayBuffer.mockReturnValue(new ArrayBuffer(12))
        mocks.encryptFilename.mockResolvedValue("encrypted-name")
        mocks.encryptMessage.mockResolvedValue("encrypted-message")
        mocks.encryptChunk.mockResolvedValue(new ArrayBuffer(21))
        mocks.encryptKeyWithPassword.mockResolvedValue({
            salt: "salt",
            encryptedKey: "encrypted-key",
            iv: "key-iv",
        })
        mocks.createGuestDrop.mockResolvedValue({
            dropId: "drop-1",
            expiresAt: "2030-01-01T00:00:00.000Z",
            uploadToken: "upload-token-1",
        })
        mocks.addFileToGuestDrop.mockResolvedValue({
            fileId: "file-1",
            s3UploadId: "multipart-1",
            uploadUrls: { 1: "https://r2.example/part-1" },
        })
        mocks.uploadChunk.mockResolvedValue("etag-1")
        mocks.extractStoredKeyMaterial.mockReturnValue("owner-key-material")
        mocks.wrapDropKey.mockResolvedValue("wrapped-owner-key")
        mocks.wrapDropKeyForOrg.mockResolvedValue({
            wrappedKey: "wrapped-org-key",
            orgKeyGeneration: 3,
        })
        mocks.finishGuestDrop
            .mockRejectedValueOnce(new Error("Finalization timed out"))
            .mockResolvedValueOnce(undefined)
    })

    afterEach(() => {
        cleanup()
        vi.unstubAllGlobals()
    })

    it("retries the same guest drop and ETag manifest without aborting or re-uploading", async () => {
        const { result } = renderHook(() => useDropUpload({
            guest: true,
            onComplete: mocks.onComplete,
        }))
        const file = new File(["hello"], "hello.txt", { type: "text/plain" })

        act(() => result.current.setFiles([file]))
        await act(async () => {
            await result.current.upload({ turnstileToken: "turnstile-1" })
        })

        await waitFor(() => expect(result.current.progress?.phase).toBe("error"))
        expect(result.current.hasPendingFinalization).toBe(true)
        expect(mocks.finishGuestDrop).toHaveBeenCalledTimes(1)
        expect(mocks.abortGuestFileUpload).not.toHaveBeenCalled()

        const firstFinishCall = mocks.finishGuestDrop.mock.calls[0]!
        expect(firstFinishCall[0]).toBe("drop-1")
        expect(firstFinishCall[1]).toEqual([
            { fileId: "file-1", chunks: [{ chunkIndex: 0, etag: "etag-1" }] },
        ])
        expect(firstFinishCall[2]).toBe("upload-token-1")

        await act(async () => {
            await result.current.retryFinalization()
        })

        await waitFor(() => expect(result.current.progress?.phase).toBe("complete"))
        expect(mocks.finishGuestDrop).toHaveBeenCalledTimes(2)
        const retryFinishCall = mocks.finishGuestDrop.mock.calls[1]!
        expect(retryFinishCall[0]).toBe(firstFinishCall[0])
        expect(retryFinishCall[1]).toBe(firstFinishCall[1])
        expect(retryFinishCall[2]).toBe(firstFinishCall[2])

        expect(mocks.createEncryptionContext).toHaveBeenCalledOnce()
        expect(mocks.createGuestDrop).toHaveBeenCalledOnce()
        expect(mocks.addFileToGuestDrop).toHaveBeenCalledOnce()
        expect(mocks.uploadChunk).toHaveBeenCalledOnce()
        expect(mocks.abortGuestFileUpload).not.toHaveBeenCalled()
        expect(result.current.hasPendingFinalization).toBe(false)
        expect(result.current.shareUrl).toContain("/d/drop-1#share-key")
        expect(mocks.onComplete).toHaveBeenCalledOnce()
    })

    it("retains authenticated key-cache context until the same manifest finishes", async () => {
        mocks.vault.current = {
            status: "unlocked",
            vaultGeneration: 7,
            vaultId: "vault-1",
            wrapDropKey: mocks.wrapDropKey,
            wrapDropKeyForOrg: mocks.wrapDropKeyForOrg,
        }
        mocks.createDrop.mockResolvedValue({
            dropId: "auth-drop-1",
            expiresAt: null,
        })
        mocks.addFileToDrop.mockResolvedValue({
            fileId: "auth-file-1",
            s3UploadId: "auth-multipart-1",
            uploadUrls: { 1: "https://r2.example/auth-part-1" },
        })
        mocks.finishDrop
            .mockRejectedValueOnce(new Error("Finalization response lost"))
            .mockResolvedValueOnce(undefined)

        const { result } = renderHook(() => useDropUpload({
            guest: false,
            onComplete: mocks.onComplete,
        }))
        const file = new File(["hello"], "hello.txt", { type: "text/plain" })

        act(() => result.current.setFiles([file]))
        await act(async () => {
            await result.current.upload()
        })

        await waitFor(() => expect(result.current.progress?.phase).toBe("error"))
        expect(result.current.hasPendingFinalization).toBe(true)
        expect(mocks.upsertCachedWrappedDropKey).not.toHaveBeenCalled()
        expect(mocks.fetch).not.toHaveBeenCalled()

        const firstFinishCall = mocks.finishDrop.mock.calls[0]!
        await act(async () => {
            await result.current.retryFinalization()
        })

        await waitFor(() => expect(result.current.progress?.phase).toBe("complete"))
        const retryFinishCall = mocks.finishDrop.mock.calls[1]!
        expect(retryFinishCall[0]).toBe("auth-drop-1")
        expect(retryFinishCall[1]).toBe(firstFinishCall[1])
        expect(mocks.createEncryptionContext).toHaveBeenCalledOnce()
        expect(mocks.createDrop).toHaveBeenCalledOnce()
        expect(mocks.addFileToDrop).toHaveBeenCalledOnce()
        expect(mocks.uploadChunk).toHaveBeenCalledOnce()
        expect(mocks.fetch).not.toHaveBeenCalled()
        expect(mocks.upsertCachedWrappedDropKey).toHaveBeenCalledWith({
            dropId: "auth-drop-1",
            wrappedKey: "wrapped-owner-key",
            vaultGeneration: 7,
        })
    })
})
