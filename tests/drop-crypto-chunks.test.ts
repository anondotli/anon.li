import { describe, expect, it } from "vitest"

import { AUTH_TAG_SIZE, MAX_CHUNKS_PER_FILE, MIN_CHUNK_SIZE } from "@/lib/constants"
import { calculateEncryptedSize, CryptoConfig } from "@/lib/crypto.client"
import { buildMultipartUploadParts } from "@/lib/storage"

const MiB = 1024 * 1024
const GiB = 1024 * MiB

describe("Drop multipart chunk sizing", () => {
    it("keeps small files in one correctly sized encrypted part", () => {
        const fileSize = 7 * MiB
        const params = CryptoConfig.getChunkParams(fileSize)

        expect(params).toEqual({ chunkSize: fileSize, chunkCount: 1 })
        expect(buildMultipartUploadParts(
            calculateEncryptedSize(fileSize, params.chunkSize),
            params.chunkSize,
            params.chunkCount,
        )).toEqual([{ partNumber: 1, contentLength: fileSize + AUTH_TAG_SIZE }])
    })

    it("uses 1,024 bounded parts for a 50 GiB file", () => {
        const params = CryptoConfig.getChunkParams(50 * GiB)

        expect(params).toEqual({ chunkSize: MIN_CHUNK_SIZE, chunkCount: 1_024 })
        expect(CryptoConfig.getConcurrency(50 * GiB)).toBe(2)
    })

    it("uses 5,120 valid parts for the advertised 250 GiB boundary", () => {
        const fileSize = 250 * GiB
        const params = CryptoConfig.getChunkParams(fileSize)
        const encryptedSize = calculateEncryptedSize(fileSize, params.chunkSize)
        const parts = buildMultipartUploadParts(encryptedSize, params.chunkSize, params.chunkCount)

        expect(params).toEqual({ chunkSize: MIN_CHUNK_SIZE, chunkCount: 5_120 })
        expect(params.chunkCount).toBeLessThanOrEqual(MAX_CHUNKS_PER_FILE)
        expect(parts).toHaveLength(5_120)
        expect(parts[0]).toEqual({
            partNumber: 1,
            contentLength: MIN_CHUNK_SIZE + AUTH_TAG_SIZE,
        })
        expect(parts.at(-1)).toEqual({
            partNumber: 5_120,
            contentLength: MIN_CHUNK_SIZE + AUTH_TAG_SIZE,
        })
    })

    it("keeps a short final part instead of shrinking every part", () => {
        const fileSize = MIN_CHUNK_SIZE + 1
        const params = CryptoConfig.getChunkParams(fileSize)
        const parts = buildMultipartUploadParts(
            calculateEncryptedSize(fileSize, params.chunkSize),
            params.chunkSize,
            params.chunkCount,
        )

        expect(params).toEqual({ chunkSize: MIN_CHUNK_SIZE, chunkCount: 2 })
        expect(parts.at(-1)?.contentLength).toBe(1 + AUTH_TAG_SIZE)
    })
})
