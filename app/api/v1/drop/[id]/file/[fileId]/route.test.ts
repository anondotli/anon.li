/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const rateLimit = vi.fn()
const auth = vi.fn()
const checkDropApiRateLimit = vi.fn()
const validateApiKey = vi.fn()
const hasExplicitApiKey = vi.fn()
const validateCsrf = vi.fn()
const getAuthUserState = vi.fn()

vi.mock("@/auth", () => ({
    auth,
}))

vi.mock("@/lib/prisma", () => ({
    prisma: {
        user: {
            findUnique: vi.fn(),
        },
        dropFile: {
            findUnique: vi.fn(),
            delete: vi.fn(),
        },
    },
}))

vi.mock("@/lib/services/drop", () => ({
    DropService: {
        incrementDownloadCount: vi.fn(),
    },
}))

vi.mock("@/lib/services/drop-storage", () => ({
    decrementStorageUsed: vi.fn(),
}))

vi.mock("@/lib/storage", () => ({
    getPresignedDownloadUrl: vi.fn(),
    abortMultipartUpload: vi.fn(),
}))

vi.mock("@/lib/rate-limit", () => ({
    rateLimit,
    getClientIp: vi.fn().mockResolvedValue("127.0.0.1"),
    rateLimiters: {},
}))

vi.mock("@/lib/api-rate-limit", () => ({
    checkApiQuota: vi.fn().mockResolvedValue({
        success: true,
        limit: 500,
        remaining: 499,
        reset: new Date(),
    }),
    checkDropApiRateLimit,
    createRateLimitHeaders: vi.fn().mockReturnValue(new Headers()),
}))

vi.mock("@/lib/api-auth", () => ({
    validateApiKey,
    hasExplicitApiKey,
}))

vi.mock("@/lib/csrf", () => ({
    validateCsrf,
}))

vi.mock("@/lib/data/auth", () => ({
    getAuthUserState,
    getAuthApiKeyRecord: vi.fn().mockResolvedValue(null),
    touchApiKeyLastUsed: vi.fn().mockResolvedValue(undefined),
}))

describe("GET /api/v1/drop/[id]/file/[fileId]", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        rateLimit.mockResolvedValue(null)
    })

    it("counts preview requests against the download limit", async () => {
        const { prisma } = await import("@/lib/prisma")
        const { DropService } = await import("@/lib/services/drop")
        const { getPresignedDownloadUrl } = await import("@/lib/storage")
        const { GET } = await import("./route")

        ;(prisma.dropFile.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: "file-123",
            storageKey: "d/fi/file-123",
            drop: {
                id: "drop-123",
                expiresAt: null,
                maxDownloads: 3,
                downloads: 0,
                deletedAt: null,
                disabled: false,
                uploadComplete: true,
                takenDown: false,
                customKey: false,
            },
        })
        ;(DropService.incrementDownloadCount as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(true)
        ;(getPresignedDownloadUrl as unknown as ReturnType<typeof vi.fn>).mockResolvedValue("https://r2.example/file")

        const response = await GET(
            new NextRequest("http://localhost/api/v1/drop/drop-123/file/file-123?preview=1"),
            { params: Promise.resolve({ id: "drop-123", fileId: "file-123" }) }
        )

        expect(DropService.incrementDownloadCount).toHaveBeenCalledWith("drop-123")
        expect(response.status).toBe(302)
    })
})

describe("DELETE /api/v1/drop/[id]/file/[fileId]", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        auth.mockResolvedValue({ user: { id: "user-123" } })
        validateApiKey.mockResolvedValue(null)
        hasExplicitApiKey.mockReturnValue(false)
        getAuthUserState.mockResolvedValue({ id: "user-123", banned: false })
        checkDropApiRateLimit.mockResolvedValue({
            success: true,
            limit: 500,
            remaining: 499,
            reset: new Date(),
        })
    })

    it("uses the dedicated upload-abort limiter", async () => {
        const limitedResponse = new Response(
            JSON.stringify({ error: "Too many requests" }),
            { status: 429, headers: { "content-type": "application/json" } }
        )
        rateLimit.mockResolvedValue(limitedResponse)

        const { DELETE } = await import("./route")

        const request = new Request("http://localhost/api/v1/drop/drop-123/file/file-123", {
            method: "DELETE",
            body: JSON.stringify({ s3UploadId: "upload-123" }),
            headers: {
                origin: "http://localhost",
                "content-type": "application/json",
            },
        })

        const response = await DELETE(request, {
            params: Promise.resolve({ id: "drop-123", fileId: "file-123" }),
        })

        expect(rateLimit).toHaveBeenCalledWith("dropAbortUpload", "user-123")
        expect(response.status).toBe(429)
    })
})
