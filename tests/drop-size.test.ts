import { describe, expect, it } from "vitest"

import {
    MAX_DROP_PLAINTEXT_FILE_SIZE,
    MIN_CHUNK_SIZE,
} from "@/lib/constants"
import { calculateEncryptedSize, CryptoConfig } from "@/lib/crypto.client"
import { encryptedStorageLimit } from "@/lib/drop-size"
import { validateFileSize } from "@/lib/drop-utils"
import { addFileApiSchema } from "@/lib/validations/drop"

const baseInput = {
    encryptedName: "encrypted-name",
    iv: "1234567890123456",
    mimeType: "application/octet-stream",
}

describe("Drop plaintext and ciphertext limits", () => {
    it("accepts an exact 250 GiB plaintext file plus bounded auth tags", () => {
        const { chunkSize, chunkCount } = CryptoConfig.getChunkParams(MAX_DROP_PLAINTEXT_FILE_SIZE)
        const encryptedSize = calculateEncryptedSize(MAX_DROP_PLAINTEXT_FILE_SIZE, chunkSize)
        const storageLimit = encryptedStorageLimit(BigInt(MAX_DROP_PLAINTEXT_FILE_SIZE), 50)

        expect(addFileApiSchema.safeParse({
            ...baseInput,
            size: encryptedSize,
            chunkSize,
            chunkCount,
        }).success).toBe(true)
        expect(() => validateFileSize(
            encryptedSize,
            BigInt(0),
            storageLimit,
            MAX_DROP_PLAINTEXT_FILE_SIZE,
            "pro",
            MAX_DROP_PLAINTEXT_FILE_SIZE,
        )).not.toThrow()
        expect(BigInt(encryptedSize)).toBeLessThanOrEqual(storageLimit)
    })

    it("rejects plaintext beyond 250 GiB even when ciphertext is structurally valid", () => {
        const plaintextSize = MAX_DROP_PLAINTEXT_FILE_SIZE + 1
        const { chunkSize, chunkCount } = CryptoConfig.getChunkParams(plaintextSize)

        expect(addFileApiSchema.safeParse({
            ...baseInput,
            size: calculateEncryptedSize(plaintextSize, chunkSize),
            chunkSize,
            chunkCount,
        }).success).toBe(false)
    })

    it("charges real ciphertext while limiting each full part to the target size", () => {
        const plaintextSize = 50 * 1024 * 1024 * 1024
        const { chunkSize, chunkCount } = CryptoConfig.getChunkParams(plaintextSize)
        const encryptedSize = calculateEncryptedSize(plaintextSize, chunkSize)

        expect(chunkSize).toBe(MIN_CHUNK_SIZE)
        expect(encryptedSize - plaintextSize).toBe(chunkCount * 16)
    })
})
