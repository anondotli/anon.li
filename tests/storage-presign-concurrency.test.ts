/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const signing = vi.hoisted(() => ({
    active: 0,
    maxActive: 0,
    calls: 0,
}))

vi.mock("@aws-sdk/s3-request-presigner", () => ({
    getSignedUrl: vi.fn(async () => {
        signing.active += 1
        signing.calls += 1
        signing.maxActive = Math.max(signing.maxActive, signing.active)
        await new Promise((resolve) => setTimeout(resolve, 2))
        signing.active -= 1
        return `https://r2.example/part-${signing.calls}`
    }),
}))

const originalEnv = process.env

describe("multipart URL signing", () => {
    beforeEach(() => {
        signing.active = 0
        signing.maxActive = 0
        signing.calls = 0
        process.env = {
            ...originalEnv,
            NODE_ENV: "test",
            R2_ACCESS_KEY_ID: "test-access-key",
            R2_SECRET_ACCESS_KEY: "test-secret-key",
            R2_ENDPOINT: "https://account-id.r2.cloudflarestorage.com",
            R2_BUCKET_NAME: "anon-li-files",
        }
    })

    afterEach(() => {
        process.env = originalEnv
        vi.resetModules()
    })

    it("bounds parallel signing while preserving every part", async () => {
        const {
            getChunkPresignedUrls,
            UPLOAD_URL_SIGNING_CONCURRENCY,
        } = await import("@/lib/storage")
        const parts = Array.from({ length: 100 }, (_, index) => ({
            partNumber: index + 1,
            contentLength: 50 * 1024 * 1024 + 16,
        }))

        const urls = await getChunkPresignedUrls("drop/file", "upload-id", parts)

        expect(Object.keys(urls)).toHaveLength(parts.length)
        expect(signing.calls).toBe(parts.length)
        expect(signing.maxActive).toBeGreaterThan(1)
        expect(signing.maxActive).toBeLessThanOrEqual(UPLOAD_URL_SIGNING_CONCURRENCY)
    })
})
