/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import {
    MAX_IN_MEMORY_DOWNLOAD_SIZE,
    prepareDownloadDestination,
} from "@/lib/drop-download-destination.client"

interface PickerWindow extends Window {
    showSaveFilePicker?: () => Promise<unknown>
}

const originalPicker = (window as PickerWindow).showSaveFilePicker
const originalStorageDescriptor = Object.getOwnPropertyDescriptor(navigator, "storage")
const originalCreateObjectUrl = URL.createObjectURL
const originalRevokeObjectUrl = URL.revokeObjectURL

function setPicker(value: PickerWindow["showSaveFilePicker"]): void {
    Object.defineProperty(window, "showSaveFilePicker", {
        configurable: true,
        writable: true,
        value,
    })
}

function setStorage(value: unknown): void {
    Object.defineProperty(navigator, "storage", {
        configurable: true,
        value,
    })
}

afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    setPicker(originalPicker)

    if (originalStorageDescriptor) {
        Object.defineProperty(navigator, "storage", originalStorageDescriptor)
    } else {
        Reflect.deleteProperty(navigator, "storage")
    }

    if (originalCreateObjectUrl) {
        URL.createObjectURL = originalCreateObjectUrl
    } else {
        Reflect.deleteProperty(URL, "createObjectURL")
    }
    if (originalRevokeObjectUrl) {
        URL.revokeObjectURL = originalRevokeObjectUrl
    } else {
        Reflect.deleteProperty(URL, "revokeObjectURL")
    }
})

describe("Drop download destinations", () => {
    it("treats native picker cancellation as a no-op", async () => {
        const abortError = new Error("Cancelled")
        abortError.name = "AbortError"
        const picker = vi.fn().mockRejectedValue(abortError)
        setPicker(picker)
        setStorage({})

        await expect(prepareDownloadDestination("large.bin", 5_000_000_000)).resolves.toBeNull()
        expect(picker).toHaveBeenCalledWith({ suggestedName: "large.bin" })
    })

    it("refuses to buffer an unsafe large file when streaming storage is unavailable", async () => {
        setPicker(undefined)
        setStorage({})

        await expect(prepareDownloadDestination(
            "large.bin",
            MAX_IN_MEMORY_DOWNLOAD_SIZE + 1,
        )).rejects.toThrow("cannot safely save this large file")
    })

    it("streams through an OPFS temp file instead of buffering", async () => {
        vi.useFakeTimers()
        setPicker(undefined)

        const write = vi.fn()
        const close = vi.fn()
        const writable = new WritableStream<Uint8Array>({ write, close })
        const removeEntry = vi.fn().mockResolvedValue(undefined)
        const getFile = vi.fn().mockResolvedValue(new File(["saved"], "temporary"))
        setStorage({
            getDirectory: vi.fn().mockResolvedValue({
                getFileHandle: vi.fn().mockResolvedValue({
                    createWritable: vi.fn().mockResolvedValue(writable),
                    getFile,
                }),
                removeEntry,
            }),
        })

        URL.createObjectURL = vi.fn().mockReturnValue("blob:download")
        URL.revokeObjectURL = vi.fn()
        const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})

        const destination = await prepareDownloadDestination("report.bin", 5_000_000_000)
        expect(destination?.kind).toBe("opfs")

        const chunk = new Uint8Array([1, 2, 3])
        await destination?.write(chunk)
        await destination?.complete()

        expect(write).toHaveBeenCalledWith(chunk, expect.anything())
        expect(close).toHaveBeenCalled()
        expect(getFile).toHaveBeenCalled()
        expect(click).toHaveBeenCalled()

        await vi.runAllTimersAsync()
        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:download")
        expect(removeEntry).toHaveBeenCalled()
    })

    it("reclaims stale plaintext temp files left by a closed tab", async () => {
        setPicker(undefined)

        const writable = new WritableStream<Uint8Array>()
        const removeEntry = vi.fn().mockResolvedValue(undefined)
        const staleFile = new File(["old plaintext"], "stale", { lastModified: 0 })
        async function* values() {
            yield {
                kind: "file" as const,
                name: ".anon-li-download-stale",
                createWritable: vi.fn().mockResolvedValue(writable),
                getFile: vi.fn().mockResolvedValue(staleFile),
            }
        }

        setStorage({
            getDirectory: vi.fn().mockResolvedValue({
                values,
                getFileHandle: vi.fn().mockResolvedValue({
                    createWritable: vi.fn().mockResolvedValue(writable),
                    getFile: vi.fn(),
                }),
                removeEntry,
            }),
        })

        const destination = await prepareDownloadDestination("new.bin", 1)

        expect(removeEntry).toHaveBeenCalledWith(".anon-li-download-stale")
        await destination?.abort()
    })
})
