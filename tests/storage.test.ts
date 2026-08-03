import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { DeleteObjectsCommandOutput } from "@aws-sdk/client-s3"

const originalEnv = process.env

describe("storage configuration", () => {
    beforeEach(() => {
        vi.resetModules()
        process.env = {
            ...originalEnv,
            NODE_ENV: "test",
            R2_ACCESS_KEY_ID: "test-access-key",
            R2_SECRET_ACCESS_KEY: "test-secret-key",
            R2_ENDPOINT: "https://account-id.r2.cloudflarestorage.com",
            // A stale/public endpoint must never be used for signed object access.
            R2_PUBLIC_ENDPOINT: "https://r2.anon.li",
            R2_BUCKET_NAME: "anon-li-files",
        }
    })

    afterEach(() => {
        vi.restoreAllMocks()
        process.env = originalEnv
        vi.resetModules()
    })

    it("signs download URLs against the private R2 S3 endpoint and bucket", async () => {
        const { getPresignedDownloadUrl } = await import("@/lib/storage")

        const presignedUrl = await getPresignedDownloadUrl("drop/file-123", 60)
        const parsedUrl = new URL(presignedUrl)

        expect(parsedUrl.origin).toBe("https://account-id.r2.cloudflarestorage.com")
        expect(parsedUrl.pathname).toBe("/anon-li-files/drop/file-123")
        expect(parsedUrl.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256")
        expect(parsedUrl.searchParams.get("X-Amz-Expires")).toBe("60")
    })

    it("does not require a public bucket endpoint", async () => {
        delete process.env.R2_PUBLIC_ENDPOINT

        const { getPresignedDownloadUrl } = await import("@/lib/storage")
        const presignedUrl = await getPresignedDownloadUrl("drop/file-123", 60)

        expect(new URL(presignedUrl).origin).toBe("https://account-id.r2.cloudflarestorage.com")
    })

    it("batches object deletions at the S3 limit", async () => {
        const { DeleteObjectsCommand, S3Client } = await import("@aws-sdk/client-s3")
        const clientPrototype = S3Client.prototype as unknown as {
            send(command: InstanceType<typeof DeleteObjectsCommand>): Promise<DeleteObjectsCommandOutput>
        }
        const send = vi.spyOn(clientPrototype, "send").mockResolvedValue({
            $metadata: {},
        })
        const { deleteObjects } = await import("@/lib/storage")
        const keys = Array.from({ length: 2_500 }, (_, index) => `key-${index}`)

        await expect(deleteObjects(keys)).resolves.toEqual([])
        expect(send).toHaveBeenCalledTimes(3)

        const batchSizes = send.mock.calls.map(([command]) => {
            if (!(command instanceof DeleteObjectsCommand)) {
                throw new Error("Expected an S3 DeleteObjectsCommand")
            }
            return command.input.Delete?.Objects?.length
        })
        expect(batchSizes).toEqual([1_000, 1_000, 500])
    })

    it("throws a service-unavailable error when the private S3 endpoint is missing", async () => {
        delete process.env.R2_ENDPOINT

        const { getPresignedDownloadUrl } = await import("@/lib/storage")

        await expect(getPresignedDownloadUrl("drop/file-123", 60)).rejects.toMatchObject({
            name: "ServiceUnavailableError",
            statusCode: 503,
        })
    })

    it("invalidates cached storage env when config changes in non-production", async () => {
        const { getPresignedDownloadUrl } = await import("@/lib/storage")

        const initialUrl = await getPresignedDownloadUrl("drop/file-123", 60)
        expect(new URL(initialUrl).origin).toBe("https://account-id.r2.cloudflarestorage.com")

        process.env.R2_ENDPOINT = "https://other-account.r2.cloudflarestorage.com"

        const nextUrl = await getPresignedDownloadUrl("drop/file-123", 60)
        expect(new URL(nextUrl).origin).toBe("https://other-account.r2.cloudflarestorage.com")
    })

    it("binds every upload URL to the exact encrypted part length", async () => {
        const {
            buildMultipartUploadParts,
            getChunkPresignedUrls,
        } = await import("@/lib/storage")
        const chunkSize = 50 * 1024 * 1024
        const finalPlaintextSize = 7 * 1024 * 1024
        const parts = buildMultipartUploadParts(
            chunkSize + finalPlaintextSize + 32,
            chunkSize,
            2,
        )

        expect(parts).toEqual([
            { partNumber: 1, contentLength: chunkSize + 16 },
            { partNumber: 2, contentLength: finalPlaintextSize + 16 },
        ])

        const urls = await getChunkPresignedUrls("drop/file-123", "upload-123", parts)
        for (const part of parts) {
            const parsedUrl = new URL(urls[part.partNumber]!)
            expect(parsedUrl.searchParams.get("partNumber")).toBe(String(part.partNumber))
            expect(parsedUrl.searchParams.get("uploadId")).toBe("upload-123")
            expect(parsedUrl.searchParams.get("X-Amz-SignedHeaders")?.split(";")).toContain("content-length")
        }
    })

    it("rejects multipart shapes that cannot match the declared encrypted size", async () => {
        const { buildMultipartUploadParts } = await import("@/lib/storage")

        expect(() => buildMultipartUploadParts(100, 50 * 1024 * 1024, 2)).toThrow(
            "Invalid multipart upload shape",
        )
    })

    it("returns null only when R2 responds that the object was not found", async () => {
        const { S3Client } = await import("@aws-sdk/client-s3")
        const notFound = Object.assign(new Error("Not Found"), {
            name: "NotFound",
            $metadata: { httpStatusCode: 404 },
        })
        vi.spyOn(S3Client.prototype, "send").mockRejectedValue(notFound)
        const { getObjectMetadata } = await import("@/lib/storage")

        await expect(getObjectMetadata("drop/missing-file")).resolves.toBeNull()
    })

    it.each([
        ["authentication", Object.assign(new Error("Forbidden"), {
            name: "AccessDenied",
            $metadata: { httpStatusCode: 403 },
        })],
        ["service", Object.assign(new Error("Unavailable"), {
            name: "ServiceUnavailable",
            $metadata: { httpStatusCode: 503 },
        })],
        ["network", new Error("socket hang up")],
    ])("rethrows %s errors while reading object metadata", async (_kind, failure) => {
        const { S3Client } = await import("@aws-sdk/client-s3")
        vi.spyOn(S3Client.prototype, "send").mockRejectedValue(failure)
        const { getObjectMetadata } = await import("@/lib/storage")

        await expect(getObjectMetadata("drop/file-123")).rejects.toBe(failure)
    })
})
