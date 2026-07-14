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
const getOrganizationAccessState = vi.fn()
const resolveDownloadAccess = vi.fn()
const consumeDownload = vi.fn()
const deletePendingDropFileAndReleaseQuota = vi.fn().mockResolvedValue(null)

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
        orphanedFile: {
            create: vi.fn(),
        },
    },
}))

vi.mock("@/lib/services/drop", () => ({
    DropService: {
        consumeDownload,
    },
}))

vi.mock("@/lib/services/drop-storage", () => ({
    decrementStorageUsed: vi.fn(),
    deleteDropFileAndReleaseQuota: vi.fn().mockResolvedValue(true),
    deletePendingDropFileAndReleaseQuota,
}))

vi.mock("@/lib/services/drop-recipient", () => ({
    resolveDownloadAccess,
    recordAccessEvent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/storage", () => ({
    getPresignedDownloadUrl: vi.fn(),
    abortMultipartUpload: vi.fn(),
    deleteObject: vi.fn(),
    LIMITED_DROP_PRESIGNED_URL_EXPIRES: 120,
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
    getOrganizationAccessState,
    getAuthApiKeyRecord: vi.fn().mockResolvedValue(null),
    touchApiKeyLastUsed: vi.fn().mockResolvedValue(undefined),
}))

describe("GET /api/v1/drop/[id]/file/[fileId]", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        rateLimit.mockResolvedValue(null)
        resolveDownloadAccess.mockResolvedValue({ allowed: true, recipientId: null })
        consumeDownload.mockResolvedValue(true)
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
        ;(getPresignedDownloadUrl as unknown as ReturnType<typeof vi.fn>).mockResolvedValue("https://r2.example/file")

        const response = await GET(
            new NextRequest("http://localhost/api/v1/drop/drop-123/file/file-123?preview=1"),
            { params: Promise.resolve({ id: "drop-123", fileId: "file-123" }) }
        )

        expect(DropService.consumeDownload).toHaveBeenCalledWith("drop-123", null)
        expect(response.status).toBe(302)
    })

    it("returns JSON instead of redirecting a recipient token to R2", async () => {
        const { prisma } = await import("@/lib/prisma")
        const { getPresignedDownloadUrl } = await import("@/lib/storage")
        const { GET } = await import("./route")

        ;(prisma.dropFile.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: "file-123",
            storageKey: "d/fi/file-123",
            drop: {
                id: "drop-123",
                expiresAt: null,
                maxDownloads: null,
                downloads: 0,
                deletedAt: null,
                disabled: false,
                uploadComplete: true,
                takenDown: false,
                customKey: false,
                restrictToRecipients: false,
            },
        })
        ;(getPresignedDownloadUrl as unknown as ReturnType<typeof vi.fn>).mockResolvedValue("https://r2.example/file")

        const response = await GET(
            new NextRequest("http://localhost/api/v1/drop/drop-123/file/file-123", {
                headers: {
                    Accept: "application/json",
                    "X-Drop-Recipient": "recipient-secret",
                },
            }),
            { params: Promise.resolve({ id: "drop-123", fileId: "file-123" }) },
        )

        expect(response.status).toBe(200)
        expect(response.headers.get("location")).toBeNull()
        await expect(response.json()).resolves.toEqual({ url: "https://r2.example/file" })
    })

    it("counts a Range request on a download-limited drop (no Range bypass)", async () => {
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
        ;(getPresignedDownloadUrl as unknown as ReturnType<typeof vi.fn>).mockResolvedValue("https://r2.example/file")

        // `Range: bytes=1-` previously skipped the counter while the redirect still
        // handed out a full-object URL — a maxDownloads bypass. It must now count.
        const response = await GET(
            new NextRequest("http://localhost/api/v1/drop/drop-123/file/file-123", {
                headers: { Range: "bytes=1-" },
            }),
            { params: Promise.resolve({ id: "drop-123", fileId: "file-123" }) }
        )

        expect(DropService.consumeDownload).toHaveBeenCalledWith("drop-123", null)
        expect(response.status).toBe(302)
    })

    it("does not count a resumed-range request on an unlimited drop", async () => {
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
                maxDownloads: null,
                downloads: 0,
                deletedAt: null,
                disabled: false,
                uploadComplete: true,
                takenDown: false,
                customKey: false,
            },
        })
        ;(getPresignedDownloadUrl as unknown as ReturnType<typeof vi.fn>).mockResolvedValue("https://r2.example/file")

        const response = await GET(
            new NextRequest("http://localhost/api/v1/drop/drop-123/file/file-123", {
                headers: { Range: "bytes=1-" },
            }),
            { params: Promise.resolve({ id: "drop-123", fileId: "file-123" }) }
        )

        // Unlimited drop: count is just a stat, so a resumed transfer must not double-count.
        expect(DropService.consumeDownload).not.toHaveBeenCalled()
        expect(response.status).toBe(302)
    })

    it("does not let Range bypass a recipient allowance on a globally unlimited drop", async () => {
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
                maxDownloads: null,
                downloads: 0,
                deletedAt: null,
                disabled: false,
                uploadComplete: true,
                takenDown: false,
                customKey: false,
                restrictToRecipients: true,
            },
        })
        resolveDownloadAccess.mockResolvedValue({ allowed: true, recipientId: "recipient-123" })
        consumeDownload.mockResolvedValue(false)
        ;(getPresignedDownloadUrl as unknown as ReturnType<typeof vi.fn>).mockResolvedValue("https://r2.example/file")

        const response = await GET(
            new NextRequest("http://localhost/api/v1/drop/drop-123/file/file-123", {
                headers: {
                    Range: "bytes=1-",
                    "X-Drop-Recipient": "recipient-secret",
                },
            }),
            { params: Promise.resolve({ id: "drop-123", fileId: "file-123" }) },
        )

        expect(DropService.consumeDownload).toHaveBeenCalledWith("drop-123", "recipient-123")
        expect(response.status).toBe(404)
        await expect(response.text()).resolves.not.toContain("https://r2.example/file")
    })

    it("does not consume either allowance when presigning fails", async () => {
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
                restrictToRecipients: true,
            },
        })
        resolveDownloadAccess.mockResolvedValue({ allowed: true, recipientId: "recipient-123" })
        ;(getPresignedDownloadUrl as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
            new Error("R2 signing failed"),
        )

        const response = await GET(
            new NextRequest("http://localhost/api/v1/drop/drop-123/file/file-123", {
                headers: { "X-Drop-Recipient": "recipient-secret" },
            }),
            { params: Promise.resolve({ id: "drop-123", fileId: "file-123" }) },
        )

        expect(response.status).toBe(500)
        expect(DropService.consumeDownload).not.toHaveBeenCalled()
    })
})

describe("DELETE /api/v1/drop/[id]/file/[fileId]", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        rateLimit.mockResolvedValue(null)
        auth.mockResolvedValue({ user: { id: "user-123" } })
        validateApiKey.mockResolvedValue(null)
        hasExplicitApiKey.mockReturnValue(false)
        getAuthUserState.mockResolvedValue({ id: "user-123", banned: false })
        deletePendingDropFileAndReleaseQuota.mockReset().mockResolvedValue(null)
        getOrganizationAccessState.mockResolvedValue({
            exists: true,
            suspended: false,
            subscribed: true,
        })
        checkDropApiRateLimit.mockResolvedValue({
            success: true,
            limit: 500,
            remaining: 499,
            reset: new Date(),
        })
    })

    it("claims a pending row before aborting and deleting its returned storage key", async () => {
        const { prisma } = await import("@/lib/prisma")
        const { abortMultipartUpload, deleteObject } = await import("@/lib/storage")
        const { DELETE } = await import("./route")

        ;(prisma.dropFile.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: "file-123",
            storageKey: "selected-key",
            s3UploadId: "upload-123",
            drop: { id: "drop-123", userId: "user-123", organizationId: null },
        })
        deletePendingDropFileAndReleaseQuota.mockResolvedValueOnce({
            storageKey: "claimed-key",
            s3UploadId: "claimed-upload",
            size: BigInt(20),
        })
        ;(abortMultipartUpload as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
        ;(deleteObject as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)

        const response = await DELETE(new Request(
            "http://localhost/api/v1/drop/drop-123/file/file-123",
            {
                method: "DELETE",
                body: JSON.stringify({ s3UploadId: "upload-123" }),
                headers: {
                    origin: "http://localhost",
                    "content-type": "application/json",
                },
            },
        ), { params: Promise.resolve({ id: "drop-123", fileId: "file-123" }) })

        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toEqual({ success: true })
        expect(deletePendingDropFileAndReleaseQuota).toHaveBeenCalledWith("file-123")
        expect(abortMultipartUpload).toHaveBeenCalledWith("claimed-key", "claimed-upload")
        expect(deleteObject).toHaveBeenCalledWith("claimed-key")
        expect(deletePendingDropFileAndReleaseQuota.mock.invocationCallOrder[0]).toBeLessThan(
            (abortMultipartUpload as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!,
        )
    })

    it("does not touch storage when a completed file wins the pending claim race", async () => {
        const { prisma } = await import("@/lib/prisma")
        const { abortMultipartUpload, deleteObject } = await import("@/lib/storage")
        const { DELETE } = await import("./route")

        ;(prisma.dropFile.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: "file-123",
            storageKey: "stale-key",
            s3UploadId: "upload-123",
            drop: { id: "drop-123", userId: "user-123", organizationId: null },
        })
        deletePendingDropFileAndReleaseQuota.mockResolvedValueOnce(null)

        const response = await DELETE(new Request(
            "http://localhost/api/v1/drop/drop-123/file/file-123",
            {
                method: "DELETE",
                body: JSON.stringify({ s3UploadId: "upload-123" }),
                headers: {
                    origin: "http://localhost",
                    "content-type": "application/json",
                },
            },
        ), { params: Promise.resolve({ id: "drop-123", fileId: "file-123" }) })

        expect(response.status).toBe(200)
        expect(abortMultipartUpload).not.toHaveBeenCalled()
        expect(deleteObject).not.toHaveBeenCalled()
    })

    it("records an orphan retry when claimed-object deletion fails", async () => {
        const { prisma } = await import("@/lib/prisma")
        const { deleteObject } = await import("@/lib/storage")
        const { DELETE } = await import("./route")

        ;(prisma.dropFile.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: "file-123",
            storageKey: "selected-key",
            s3UploadId: "upload-123",
            drop: { id: "drop-123", userId: "user-123", organizationId: null },
        })
        deletePendingDropFileAndReleaseQuota.mockResolvedValueOnce({
            storageKey: "claimed-key",
            s3UploadId: null,
            size: BigInt(20),
        })
        ;(deleteObject as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("R2 unavailable"))
        ;(prisma.orphanedFile.create as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "orphan-1" })

        const response = await DELETE(new Request(
            "http://localhost/api/v1/drop/drop-123/file/file-123",
            {
                method: "DELETE",
                body: JSON.stringify({ s3UploadId: "upload-123" }),
                headers: {
                    origin: "http://localhost",
                    "content-type": "application/json",
                },
            },
        ), { params: Promise.resolve({ id: "drop-123", fileId: "file-123" }) })

        expect(response.status).toBe(200)
        expect(prisma.orphanedFile.create).toHaveBeenCalledWith({
            data: { storageKey: "claimed-key" },
        })
    })

    it("rejects an org API key aborting the same user's personal drop", async () => {
        const { prisma } = await import("@/lib/prisma")
        const { abortMultipartUpload, deleteObject } = await import("@/lib/storage")
        const { DELETE } = await import("./route")

        validateApiKey.mockResolvedValue({
            user: { id: "user-123", subscriptions: [] },
            apiKeyId: "key-123",
            organizationId: "org-123",
            rateLimit: {
                success: true,
                limit: 500,
                remaining: 499,
                reset: new Date(),
            },
        })
        ;(prisma.dropFile.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: "file-123",
            storageKey: "personal-key",
            s3UploadId: "upload-123",
            drop: {
                id: "drop-123",
                userId: "user-123",
                organizationId: null,
            },
        })

        const response = await DELETE(new Request(
            "http://localhost/api/v1/drop/drop-123/file/file-123",
            {
                method: "DELETE",
                body: JSON.stringify({ s3UploadId: "upload-123" }),
                headers: {
                    authorization: "Bearer ak_org-key",
                    "content-type": "application/json",
                },
            },
        ), { params: Promise.resolve({ id: "drop-123", fileId: "file-123" }) })

        expect(response.status).toBe(401)
        await expect(response.json()).resolves.toEqual({ error: "Unauthorized" })
        expect(deletePendingDropFileAndReleaseQuota).not.toHaveBeenCalled()
        expect(abortMultipartUpload).not.toHaveBeenCalled()
        expect(deleteObject).not.toHaveBeenCalled()
    })

    it("allows an org session to abort a same-org drop created by another member", async () => {
        const { prisma } = await import("@/lib/prisma")
        const { abortMultipartUpload, deleteObject } = await import("@/lib/storage")
        const { DELETE } = await import("./route")

        auth.mockResolvedValue({
            user: { id: "user-123" },
            activeOrganizationId: "org-123",
            activeOrgRole: "member",
        })
        ;(prisma.dropFile.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: "file-123",
            storageKey: "selected-key",
            s3UploadId: "upload-123",
            drop: {
                id: "drop-123",
                userId: "other-member",
                organizationId: "org-123",
            },
        })
        deletePendingDropFileAndReleaseQuota.mockResolvedValueOnce({
            storageKey: "claimed-org-key",
            s3UploadId: "claimed-upload",
            size: BigInt(20),
        })
        ;(abortMultipartUpload as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
        ;(deleteObject as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)

        const response = await DELETE(new Request(
            "http://localhost/api/v1/drop/drop-123/file/file-123",
            {
                method: "DELETE",
                body: JSON.stringify({ s3UploadId: "upload-123" }),
                headers: {
                    origin: "http://localhost",
                    "content-type": "application/json",
                },
            },
        ), { params: Promise.resolve({ id: "drop-123", fileId: "file-123" }) })

        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toEqual({ success: true })
        expect(deletePendingDropFileAndReleaseQuota).toHaveBeenCalledWith("file-123")
        expect(abortMultipartUpload).toHaveBeenCalledWith("claimed-org-key", "claimed-upload")
        expect(deleteObject).toHaveBeenCalledWith("claimed-org-key")
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
