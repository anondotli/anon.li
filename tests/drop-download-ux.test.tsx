/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { DropDownloadView } from "@/components/drop/download/drop-view"
import { FilePreview } from "@/components/drop/file-preview"

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
})

describe("Drop recipient download UX", () => {
    it("does not offer previews that could spend a recipient allowance", () => {
        const { container } = render(
            <DropDownloadView
                drop={{
                    id: "drop-1",
                    title: null,
                    message: null,
                    downloads: 0,
                    maxDownloads: null,
                    expiresAt: null,
                    hideBranding: true,
                    files: [
                        { id: "a", encryptedName: "a", decryptedName: "photo.png", size: 10, mimeType: "image/png", iv: "iv", chunkSize: 1, chunkCount: 1 },
                    ],
                }}
                keyString="key"
                recipientToken="recipient-secret"
                downloading={false}
                downloadProgress={0}
                currentFile={null}
                downloadError={null}
                clearDownloadError={vi.fn()}
                downloadFile={vi.fn()}
                downloadAll={vi.fn()}
                canDownloadAsZip
                formatBytes={(size) => `${size} bytes`}
            />,
        )

        expect(container.querySelector(".relative.group")).toBeNull()
    })

    it("keeps individual downloads available when a drop is too large for an in-browser ZIP", () => {
        render(
            <DropDownloadView
                drop={{
                    id: "drop-1",
                    title: "Large delivery",
                    message: null,
                    downloads: 0,
                    maxDownloads: null,
                    expiresAt: null,
                    hideBranding: true,
                    files: [
                        { id: "a", encryptedName: "a", decryptedName: "a.bin", size: 400_000_000, mimeType: "application/octet-stream", iv: "iv", chunkSize: 1, chunkCount: 1 },
                        { id: "b", encryptedName: "b", decryptedName: "b.bin", size: 400_000_000, mimeType: "application/octet-stream", iv: "iv", chunkSize: 1, chunkCount: 1 },
                    ],
                }}
                keyString="key"
                recipientToken={null}
                downloading={false}
                downloadProgress={0}
                currentFile={null}
                downloadError={null}
                clearDownloadError={vi.fn()}
                downloadFile={vi.fn()}
                downloadAll={vi.fn()}
                canDownloadAsZip={false}
                formatBytes={(size) => `${size} bytes`}
            />,
        )

        expect(screen.getByText("Download files individually")).toBeTruthy()
        expect(screen.queryByRole("button", { name: /download all/i })).toBeNull()
        expect(screen.getByRole("button", { name: "Download a.bin" })).toBeTruthy()
        expect(screen.getByRole("button", { name: "Download b.bin" })).toBeTruthy()
    })

    it("shows download failures inline without hiding the retry controls", () => {
        const clearDownloadError = vi.fn()

        render(
            <DropDownloadView
                drop={{
                    id: "drop-1",
                    title: null,
                    message: null,
                    downloads: 0,
                    maxDownloads: null,
                    expiresAt: null,
                    hideBranding: true,
                    files: [
                        { id: "a", encryptedName: "a", decryptedName: "a.bin", size: 10, mimeType: "application/octet-stream", iv: "iv", chunkSize: 1, chunkCount: 1 },
                    ],
                }}
                keyString="key"
                recipientToken={null}
                downloading={false}
                downloadProgress={0}
                currentFile={null}
                downloadError="The connection was interrupted."
                clearDownloadError={clearDownloadError}
                downloadFile={vi.fn()}
                downloadAll={vi.fn()}
                canDownloadAsZip
                formatBytes={(size) => `${size} bytes`}
            />,
        )

        expect(screen.getByRole("alert").textContent).toContain("The connection was interrupted.")
        expect(screen.getByRole("button", { name: /download a\.bin/i })).toBeTruthy()

        fireEvent.click(screen.getByRole("button", { name: "Dismiss" }))
        expect(clearDownloadError).toHaveBeenCalledOnce()
    })

    it("forwards a restricted recipient token when fetching a preview", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(new Response(
                JSON.stringify({ url: "https://r2.example/file" }),
                { status: 200, headers: { "content-type": "application/json" } },
            ))
            .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 }))

        render(
            <FilePreview
                dropId="drop-1"
                fileId="file-1"
                filename="note.txt"
                mimeType="text/plain"
                keyString="invalid-key-is-fine-after-fetch"
                ivString="AAAAAAAAAAAAAAAA"
                size={3}
                chunkSize={3}
                chunkCount={1}
                recipientToken="recipient-secret"
            >
                <button type="button">Preview file</button>
            </FilePreview>,
        )

        fireEvent.click(screen.getByRole("button", { name: "Preview file" }))

        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
            "/api/v1/drop/drop-1/file/file-1?preview=1",
            {
                headers: {
                    Accept: "application/json",
                    "X-Drop-Recipient": "recipient-secret",
                },
                credentials: "same-origin",
                redirect: "error",
                signal: undefined,
            },
        ))
        expect(fetchMock).toHaveBeenNthCalledWith(2, "https://r2.example/file", {
            credentials: "omit",
            referrerPolicy: "no-referrer",
            signal: undefined,
        })
    })
})
