import { afterEach, beforeEach, describe, expect, it } from "vitest"

const originalEnv = process.env

describe("storage configuration", () => {
    beforeEach(async () => {
        process.env = {
            ...originalEnv,
            NODE_ENV: "test",
            R2_ACCESS_KEY_ID: "test-access-key",
            R2_SECRET_ACCESS_KEY: "test-secret-key",
            R2_ENDPOINT: "https://account-id.r2.cloudflarestorage.com",
            R2_PUBLIC_ENDPOINT: "https://r2.anon.li",
            R2_BUCKET_NAME: "anon-li-files",
        }

        const { resetStorageCacheForTests } = await import("@/lib/storage")
        resetStorageCacheForTests()
    })

    afterEach(async () => {
        process.env = originalEnv
        const { resetStorageCacheForTests } = await import("@/lib/storage")
        resetStorageCacheForTests()
    })

    it("signs download URLs against the public R2 custom domain", async () => {
        const { getPresignedDownloadUrl } = await import("@/lib/storage")

        const presignedUrl = await getPresignedDownloadUrl("drop/file-123", 60)
        const parsedUrl = new URL(presignedUrl)

        expect(parsedUrl.origin).toBe("https://r2.anon.li")
        expect(parsedUrl.pathname).toBe("/drop/file-123")
        expect(parsedUrl.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256")
        expect(parsedUrl.searchParams.get("X-Amz-Expires")).toBe("60")
    })

    it("throws a service-unavailable error when storage env is missing", async () => {
        delete process.env.R2_PUBLIC_ENDPOINT

        const { resetStorageCacheForTests, getPresignedDownloadUrl } = await import("@/lib/storage")
        resetStorageCacheForTests()

        await expect(getPresignedDownloadUrl("drop/file-123", 60)).rejects.toMatchObject({
            name: "ServiceUnavailableError",
            statusCode: 503,
        })
    })

    it("invalidates cached storage env when config changes in non-production", async () => {
        const { getPresignedDownloadUrl } = await import("@/lib/storage")

        const initialUrl = await getPresignedDownloadUrl("drop/file-123", 60)
        expect(new URL(initialUrl).origin).toBe("https://r2.anon.li")

        process.env.R2_PUBLIC_ENDPOINT = "https://r2-alt.anon.li"

        const nextUrl = await getPresignedDownloadUrl("drop/file-123", 60)
        expect(new URL(nextUrl).origin).toBe("https://r2-alt.anon.li")
    })
})
