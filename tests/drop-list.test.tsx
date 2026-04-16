/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"

import type { DropData, StorageData } from "@/actions/drop"

const LINK_KEY = "A".repeat(43)
const PASSWORD_DROP_KEY = "B".repeat(43)
const GOOD_KEY = "C".repeat(43)

const fetchWrappedDropKeys = vi.fn()
const unwrapDropKey = vi.fn()
const exportKeyBase64Url = vi.fn()
const decryptFilename = vi.fn()
const base64UrlToArrayBuffer = vi.fn(() => new ArrayBuffer(12))
const callBase64UrlToArrayBuffer = base64UrlToArrayBuffer as unknown as (value: string) => ArrayBuffer
const writeText = vi.fn()
const windowOpen = vi.fn()

vi.mock("sonner", () => ({
    toast: {
        error: vi.fn(),
        success: vi.fn(),
    },
}))

vi.mock("@/actions/drop", () => ({
    toggleDropAction: vi.fn().mockResolvedValue({ data: { disabled: true } }),
    deleteDropAction: vi.fn().mockResolvedValue({}),
}))

vi.mock("@/components/vault/vault-provider", () => ({
    useVault: () => ({ unwrapDropKey }),
}))

vi.mock("@/lib/vault/drop-keys-client", () => ({
    fetchWrappedDropKeys: () => fetchWrappedDropKeys(),
}))

vi.mock("@/lib/vault/crypto", () => ({
    exportKeyBase64Url: (key: CryptoKey) => exportKeyBase64Url(key),
}))

vi.mock("@/lib/crypto.client", () => ({
    cryptoService: {
        base64UrlToArrayBuffer: (value: string) => callBase64UrlToArrayBuffer(value),
        decryptFilename: (encryptedFilename: string, key: CryptoKey, iv: Uint8Array) => decryptFilename(encryptedFilename, key, iv),
    },
}))

vi.mock("@/components/drop/qr-code-share", () => ({
    QRCodeShare: ({
        encryptionKey,
        url,
    }: {
        encryptionKey?: string | null
        url: string
    }) => (
        <div
            data-key={encryptionKey ?? ""}
            data-testid={`qr-share:${url.split("/").pop() ?? "drop"}`}
            data-url={url}
        />
    ),
}))

const storage: StorageData = {
    used: "0",
    limit: "1024",
}

function createDrop(overrides: Partial<DropData>): DropData {
    return {
        id: "drop-default",
        encryptedTitle: null,
        iv: "abcdefghijklmnop",
        downloads: 0,
        maxDownloads: null,
        expiresAt: null,
        customKey: false,
        hideBranding: false,
        disabled: false,
        takenDown: false,
        takedownReason: null,
        uploadComplete: true,
        createdAt: "2026-04-15T00:00:00.000Z",
        files: [
            {
                id: "file-default",
                encryptedName: "enc-default-name",
                size: "128",
                mimeType: "text/plain",
                iv: "ponmlkjihgfedcba",
            },
        ],
        fileCount: 1,
        totalSize: "128",
        ...overrides,
    }
}

describe("DropList", () => {
    beforeEach(() => {
        cleanup()
    })

    beforeEach(() => {
        fetchWrappedDropKeys.mockReset()
        unwrapDropKey.mockReset()
        exportKeyBase64Url.mockReset()
        decryptFilename.mockReset()
        base64UrlToArrayBuffer.mockClear()
        writeText.mockReset()
        writeText.mockResolvedValue(undefined)
        windowOpen.mockReset()

        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: { writeText },
        })
        Object.defineProperty(window, "open", {
            configurable: true,
            value: windowOpen,
        })

        decryptFilename.mockImplementation(async (encryptedName: string) => {
            if (encryptedName === "enc-link-name") return "link.txt"
            if (encryptedName === "enc-password-name") return "protected.txt"
            if (encryptedName === "enc-good-name") return "good.txt"
            return encryptedName
        })

        exportKeyBase64Url.mockImplementation(async (wrappedKey: string) => {
            if (wrappedKey === "wrapped-link") return LINK_KEY
            if (wrappedKey === "wrapped-password") return PASSWORD_DROP_KEY
            if (wrappedKey === "wrapped-good") return GOOD_KEY
            return null
        })
    })

    it("keeps the recovered key out of the row UI while using it in link actions", async () => {
        const origin = window.location.origin
        fetchWrappedDropKeys.mockResolvedValue([
            { dropId: "drop-link", wrappedKey: "wrapped-link", vaultGeneration: 1 },
        ])
        unwrapDropKey.mockImplementation(async (wrappedKey: string) => wrappedKey as unknown as CryptoKey)

        const drop = createDrop({
            id: "drop-link",
            files: [
                {
                    id: "file-link",
                    encryptedName: "enc-link-name",
                    size: "256",
                    mimeType: "text/plain",
                    iv: "ponmlkjihgfedcba",
                },
            ],
            totalSize: "256",
        })

        const { DropList } = await import("@/components/drop/drop-list")
        render(<DropList initialDrops={[drop]} storage={storage} />)

        expect(await screen.findByText("link.txt")).toBeTruthy()
        expect(screen.queryByText(LINK_KEY)).toBeNull()
        expect(screen.queryByText("Encryption key")).toBeNull()

        const qrShare = screen.getByTestId("qr-share:drop-link")
        expect(qrShare.getAttribute("data-url")).toBe(`${origin}/d/drop-link`)
        expect(qrShare.getAttribute("data-key")).toBe(LINK_KEY)

        fireEvent.click(screen.getByLabelText("Copy Link"))
        expect(writeText).toHaveBeenCalledWith(`${origin}/d/drop-link#${LINK_KEY}`)

        fireEvent.click(screen.getByLabelText("Open / Download"))
        expect(windowOpen).toHaveBeenCalledWith(
            `${origin}/d/drop-link#${LINK_KEY}`,
            "_blank",
            "noopener,noreferrer",
        )
    })

    it("keeps password-protected drops on the password flow and does not reveal the raw key", async () => {
        const origin = window.location.origin
        fetchWrappedDropKeys.mockResolvedValue([
            { dropId: "drop-password", wrappedKey: "wrapped-password", vaultGeneration: 1 },
        ])
        unwrapDropKey.mockImplementation(async (wrappedKey: string) => wrappedKey as unknown as CryptoKey)

        const drop = createDrop({
            id: "drop-password",
            customKey: true,
            files: [
                {
                    id: "file-password",
                    encryptedName: "enc-password-name",
                    size: "512",
                    mimeType: "text/plain",
                    iv: "ponmlkjihgfedcba",
                },
            ],
            totalSize: "512",
        })

        const { DropList } = await import("@/components/drop/drop-list")
        render(<DropList initialDrops={[drop]} storage={storage} />)

        expect(await screen.findByText("protected.txt")).toBeTruthy()
        expect(screen.getByText("Protected")).toBeTruthy()
        expect(screen.queryByText("Encryption key")).toBeNull()
        expect(screen.queryByText(PASSWORD_DROP_KEY)).toBeNull()

        const qrShare = screen.getByTestId("qr-share:drop-password")
        expect(qrShare.getAttribute("data-url")).toBe(`${origin}/d/drop-password`)
        expect(qrShare.getAttribute("data-key")).toBe("")

        fireEvent.click(screen.getByLabelText("Copy Link"))
        expect(writeText).toHaveBeenCalledWith(`${origin}/d/drop-password`)

        fireEvent.click(screen.getByLabelText("Open / Download"))
        expect(windowOpen).toHaveBeenCalledWith(
            `${origin}/d/drop-password`,
            "_blank",
            "noopener,noreferrer",
        )
    })

    it("isolates key failures to the affected row", async () => {
        fetchWrappedDropKeys.mockResolvedValue([
            { dropId: "drop-good", wrappedKey: "wrapped-good", vaultGeneration: 1 },
            { dropId: "drop-bad", wrappedKey: "wrapped-bad", vaultGeneration: 1 },
        ])
        unwrapDropKey.mockImplementation(async (wrappedKey: string) => {
            if (wrappedKey === "wrapped-bad") {
                throw new Error("unwrap failed")
            }
            return wrappedKey as unknown as CryptoKey
        })

        const goodDrop = createDrop({
            id: "drop-good",
            files: [
                {
                    id: "file-good",
                    encryptedName: "enc-good-name",
                    size: "128",
                    mimeType: "text/plain",
                    iv: "ponmlkjihgfedcba",
                },
            ],
        })
        const badDrop = createDrop({
            id: "drop-bad",
            files: [
                {
                    id: "file-bad",
                    encryptedName: "enc-bad-name",
                    size: "64",
                    mimeType: "text/plain",
                    iv: "ponmlkjihgfedcba",
                },
            ],
            totalSize: "64",
        })

        const { DropList } = await import("@/components/drop/drop-list")
        render(<DropList initialDrops={[goodDrop, badDrop]} storage={storage} />)

        expect(await screen.findByText("good.txt")).toBeTruthy()

        const unavailableRow = screen.getByText("Drop drop-bad...").closest("tr")
        expect(unavailableRow).toBeTruthy()

        const unavailableCopyButton = within(unavailableRow as HTMLElement).getByLabelText("Copy Link") as HTMLButtonElement
        const unavailableToggleButton = within(unavailableRow as HTMLElement).getByLabelText("Disable Link") as HTMLButtonElement

        expect(unavailableCopyButton.disabled).toBe(true)
        expect(unavailableToggleButton.disabled).toBe(false)
        expect(screen.queryByText(GOOD_KEY)).toBeNull()
    })
})
