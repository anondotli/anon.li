import { describe, expect, it } from "vitest"

import { AUTH_TAG_SIZE, MAX_CHUNKS_PER_FILE, MIN_CHUNK_SIZE } from "@/lib/constants"
import { calculateEncryptedSize, cryptoService, CryptoConfig } from "@/lib/crypto.client"
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

describe("Drop chunk nonces", () => {
    it("uses the complete 96-bit base IV for new ciphertext", async () => {
        const keyString = await cryptoService.generateKey()
        const key = await cryptoService.importKey(keyString)
        const baseIv = new Uint8Array([
            1, 2, 3, 4, 5, 6, 7, 8,
            0x10, 0x20, 0x30, 0x40,
        ])
        const plaintext = new TextEncoder().encode("nonce regression").buffer
        const ciphertext = await cryptoService.encryptChunk(plaintext, key, baseIv, 3)

        const legacyIv = new Uint8Array(12)
        legacyIv.set(baseIv.slice(0, 8))
        new DataView(legacyIv.buffer).setUint32(8, 3, false)

        await expect(crypto.subtle.decrypt(
            { name: "AES-GCM", iv: legacyIv },
            key,
            ciphertext,
        )).rejects.toThrow()
        await expect(cryptoService.decryptChunk(ciphertext, key, baseIv, 3))
            .resolves.toEqual(plaintext)
    })

    it("still decrypts ciphertext written with the legacy 64-bit-prefix nonce", async () => {
        const keyString = await cryptoService.generateKey()
        const key = await cryptoService.importKey(keyString)
        const baseIv = new Uint8Array([
            9, 8, 7, 6, 5, 4, 3, 2,
            0xaa, 0xbb, 0xcc, 0xdd,
        ])
        const legacyIv = new Uint8Array(12)
        legacyIv.set(baseIv.slice(0, 8))
        new DataView(legacyIv.buffer).setUint32(8, 7, false)
        const plaintext = new TextEncoder().encode("legacy ciphertext").buffer
        const ciphertext = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: legacyIv },
            key,
            plaintext,
        )

        await expect(cryptoService.decryptChunk(ciphertext, key, baseIv, 7))
            .resolves.toEqual(plaintext)
    })
})

describe("Drop decryption stream integrity", () => {
    it("decrypts only when the complete declared ciphertext is present", async () => {
        const keyString = await cryptoService.generateKey()
        const key = await cryptoService.importKey(keyString)
        const baseIv = crypto.getRandomValues(new Uint8Array(12))
        const first = await cryptoService.encryptChunk(
            new TextEncoder().encode("abc").buffer,
            key,
            baseIv,
            0,
        )
        const second = await cryptoService.encryptChunk(
            new TextEncoder().encode("de").buffer,
            key,
            baseIv,
            1,
        )
        const encryptedSize = first.byteLength + second.byteLength

        const complete = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new Uint8Array(first))
                controller.enqueue(new Uint8Array(second))
                controller.close()
            },
        }).pipeThrough(cryptoService.createDecryptionStream(key, baseIv, 3, {
            encryptedSize,
            chunkCount: 2,
        }))

        await expect(new Response(complete).text()).resolves.toBe("abcde")
    })

    it("rejects ciphertext truncated at an authenticated chunk boundary", async () => {
        const keyString = await cryptoService.generateKey()
        const key = await cryptoService.importKey(keyString)
        const baseIv = crypto.getRandomValues(new Uint8Array(12))
        const first = await cryptoService.encryptChunk(
            new TextEncoder().encode("abc").buffer,
            key,
            baseIv,
            0,
        )

        const truncated = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new Uint8Array(first))
                controller.close()
            },
        }).pipeThrough(cryptoService.createDecryptionStream(key, baseIv, 3, {
            encryptedSize: first.byteLength + 18,
            chunkCount: 2,
        }))

        await expect(new Response(truncated).arrayBuffer()).rejects.toThrow(
            "Encrypted file is incomplete or malformed",
        )
    })
})
