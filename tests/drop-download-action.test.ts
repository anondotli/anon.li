/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const rateLimit = vi.fn()
const findDrop = vi.fn()
const resolveDownloadAccess = vi.fn()
const consumeDownload = vi.fn()
const getPresignedDownloadUrl = vi.fn()

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}))

vi.mock("next/headers", () => ({
    headers: vi.fn().mockResolvedValue(new Headers({ "user-agent": "vitest" })),
}))

vi.mock("@/lib/rate-limit", () => ({
    rateLimit,
    getClientIp: vi.fn().mockResolvedValue("127.0.0.1"),
    rateLimiters: {},
}))

vi.mock("@/lib/prisma", () => ({
    prisma: {
        drop: { findUnique: findDrop },
    },
}))

vi.mock("@/lib/services/drop", () => ({
    DropService: { consumeDownload },
}))

vi.mock("@/lib/services/drop-recipient", () => ({
    resolveDownloadAccess,
    recordAccessEvent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/storage", () => ({
    abortMultipartUpload: vi.fn(),
    buildMultipartUploadParts: vi.fn(),
    getChunkPresignedUrls: vi.fn(),
    getPresignedDownloadUrl,
    LIMITED_DROP_PRESIGNED_URL_EXPIRES: 120,
}))

describe("recordDownloadAction", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        rateLimit.mockResolvedValue(null)
        findDrop.mockResolvedValue({
            id: "drop-123",
            deletedAt: null,
            disabled: false,
            takenDown: false,
            uploadComplete: true,
            expiresAt: null,
            maxDownloads: 3,
            downloads: 0,
            restrictToRecipients: true,
            files: [
                { id: "file-1", storageKey: "d/fi/file-1" },
                { id: "file-2", storageKey: "d/fi/file-2" },
            ],
        })
        resolveDownloadAccess.mockResolvedValue({ allowed: true, recipientId: "recipient-123" })
        consumeDownload.mockResolvedValue(true)
    })

    it("does not consume either allowance when batch presigning fails", async () => {
        const { recordDownloadAction } = await import("@/actions/drop")
        getPresignedDownloadUrl
            .mockResolvedValueOnce("https://r2.example/d/fi/file-1")
            .mockRejectedValueOnce(new Error("R2 signing failed"))

        const result = await recordDownloadAction("drop-123", "recipient-secret")

        expect(result).toEqual({ error: "Failed to record download" })
        expect(consumeDownload).not.toHaveBeenCalled()
    })
})
