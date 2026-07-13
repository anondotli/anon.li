/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const progress: {
    phase: "error"
    currentFileIndex: number
    totalFiles: number
    currentFileName: string
    encryptedChunks: number
    uploadedChunks: number
    totalChunks: number
    bytesUploaded: number
    totalBytes: number
    error: string
} = {
    phase: "error",
    currentFileIndex: 0,
    totalFiles: 1,
    currentFileName: "hello.txt",
    encryptedChunks: 0,
    uploadedChunks: 1,
    totalChunks: 1,
    bytesUploaded: 5,
    totalBytes: 5,
    error: "Network request failed",
}

const upload = vi.fn()
const prepareRetry = vi.fn()
const retryFinalization = vi.fn()

vi.mock("@/hooks/use-file-drop", () => ({
    useFileDrop: () => ({ droppedFiles: null, setDroppedFiles: vi.fn() }),
}))

vi.mock("@/hooks/use-drop-upload", () => ({
    useDropUpload: () => ({
        files: [new File(["hello"], "hello.txt", { type: "text/plain" })],
        setFiles: vi.fn(),
        progress,
        shareUrl: null,
        dropMeta: null,
        features: { noBranding: false, downloadNotifications: false, customKey: false },
        maxFileSize: 100 * 1024 * 1024,
        maxFiles: 5,
        maxExpiry: 3,
        isUploading: true,
        hasPendingFinalization: true,
        upload,
        cancel: vi.fn(),
        prepareRetry,
        retryFinalization,
        reset: vi.fn(),
    }),
}))

vi.mock("@/components/ui/turnstile", () => ({
    Turnstile: () => <div>Fresh verification challenge</div>,
}))

import { FileUploader } from "@/components/drop/file-uploader"

beforeEach(() => {
    upload.mockClear()
    prepareRetry.mockClear()
    retryFinalization.mockClear()
})

afterEach(() => cleanup())

describe("guest Drop retry", () => {
    it("retries pending finalization without creating a new drop or Turnstile challenge", async () => {
        render(<FileUploader guest userTier="guest" />)

        fireEvent.click(screen.getByRole("button", { name: /retry/i }))

        await waitFor(() => expect(retryFinalization).toHaveBeenCalledOnce())
        expect(upload).not.toHaveBeenCalled()
        expect(prepareRetry).not.toHaveBeenCalled()
        expect(screen.queryByText("Fresh verification challenge")).toBeNull()
    })
})
