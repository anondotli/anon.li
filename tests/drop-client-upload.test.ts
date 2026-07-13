import { afterEach, describe, expect, it, vi } from "vitest"

import { uploadChunk } from "@/lib/drop.client"

afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
})

describe("direct Drop uploads", () => {
    it("reports a missing exposed ETag as an R2 CORS configuration error", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(null, { status: 200 }),
        )

        await expect(uploadChunk("https://r2.example/upload", new ArrayBuffer(1)))
            .rejects.toThrow("storage did not expose its ETag")
    })

    it("retries transient R2 throttling", async () => {
        vi.useFakeTimers()
        const fetchMock = vi.spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(new Response(null, { status: 429 }))
            .mockResolvedValueOnce(new Response(null, {
                status: 200,
                headers: { ETag: '"part-etag"' },
            }))

        const upload = uploadChunk("https://r2.example/upload", new ArrayBuffer(1))
        await vi.runAllTimersAsync()

        await expect(upload).resolves.toBe('"part-etag"')
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it("does not retry a non-transient signed-request error", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(null, { status: 403 }),
        )

        await expect(uploadChunk("https://r2.example/upload", new ArrayBuffer(1)))
            .rejects.toThrow("Failed to upload chunk")
        expect(fetchMock).toHaveBeenCalledOnce()
    })
})
