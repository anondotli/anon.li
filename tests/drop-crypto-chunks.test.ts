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

describe("Drop decryption stream buffering", () => {
    async function encryptFile(plaintext: Uint8Array, chunkSize: number) {
        const keyString = await cryptoService.generateKey()
        const key = await cryptoService.importKey(keyString)
        const baseIv = crypto.getRandomValues(new Uint8Array(12))
        const parts: Uint8Array[] = []
        let chunkCount = 0
        for (let start = 0; start < plaintext.byteLength; start += chunkSize) {
            const slice = plaintext.slice(start, start + chunkSize)
            parts.push(new Uint8Array(await cryptoService.encryptChunk(slice.buffer, key, baseIv, chunkCount)))
            chunkCount++
        }
        const ciphertext = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0))
        let offset = 0
        for (const part of parts) {
            ciphertext.set(part, offset)
            offset += part.byteLength
        }
        return { key, baseIv, ciphertext, chunkCount }
    }

    function streamInReads(ciphertext: Uint8Array, readSizes: number[]) {
        return new ReadableStream<Uint8Array>({
            start(controller) {
                let offset = 0
                let i = 0
                while (offset < ciphertext.byteLength) {
                    const size = readSizes[i++ % readSizes.length]!
                    // Copy so the stream cannot rely on reads sharing one buffer.
                    controller.enqueue(ciphertext.slice(offset, offset + size))
                    offset += size
                }
                controller.close()
            },
        })
    }

    it("decrypts ciphertext split into many small odd-sized reads", async () => {
        const chunkSize = 37
        const plaintext = crypto.getRandomValues(new Uint8Array(chunkSize * 9))
        const { key, baseIv, ciphertext, chunkCount } = await encryptFile(plaintext, chunkSize)
        expect(ciphertext.byteLength).toBe(chunkCount * (chunkSize + AUTH_TAG_SIZE))

        const decrypted = streamInReads(ciphertext, [1, 7, 3, 53, 2, 101, 13])
            .pipeThrough(cryptoService.createDecryptionStream(key, baseIv, chunkSize, {
                encryptedSize: ciphertext.byteLength,
                chunkCount,
            }))

        expect(new Uint8Array(await new Response(decrypted).arrayBuffer())).toEqual(plaintext)
    })

    it("decrypts a short final chunk delivered across reads, including one read spanning chunks", async () => {
        const chunkSize = 64
        const plaintext = crypto.getRandomValues(new Uint8Array(chunkSize * 4 + 11))
        const { key, baseIv, ciphertext, chunkCount } = await encryptFile(plaintext, chunkSize)
        expect(chunkCount).toBe(5)

        // A 200-byte read spans multiple encrypted chunks; 5-byte reads split
        // the final short chunk.
        const decrypted = streamInReads(ciphertext, [200, 5])
            .pipeThrough(cryptoService.createDecryptionStream(key, baseIv, chunkSize, {
                encryptedSize: ciphertext.byteLength,
                chunkCount,
            }))

        expect(new Uint8Array(await new Response(decrypted).arrayBuffer())).toEqual(plaintext)
    })

    it("decrypts when the entire file arrives in a single read", async () => {
        const chunkSize = 16
        const plaintext = crypto.getRandomValues(new Uint8Array(chunkSize * 3 + 1))
        const { key, baseIv, ciphertext, chunkCount } = await encryptFile(plaintext, chunkSize)

        const decrypted = streamInReads(ciphertext, [ciphertext.byteLength])
            .pipeThrough(cryptoService.createDecryptionStream(key, baseIv, chunkSize, {
                encryptedSize: ciphertext.byteLength,
                chunkCount,
            }))

        expect(new Uint8Array(await new Response(decrypted).arrayBuffer())).toEqual(plaintext)
    })

    it("rejects more full chunks than declared", async () => {
        const chunkSize = 16
        const plaintext = crypto.getRandomValues(new Uint8Array(chunkSize * 3))
        const { key, baseIv, ciphertext } = await encryptFile(plaintext, chunkSize)

        const decrypted = streamInReads(ciphertext, [9])
            .pipeThrough(cryptoService.createDecryptionStream(key, baseIv, chunkSize, {
                encryptedSize: ciphertext.byteLength,
                chunkCount: 2,
            }))

        await expect(new Response(decrypted).arrayBuffer()).rejects.toThrow(
            "Encrypted file contains too many chunks",
        )
    })
})
