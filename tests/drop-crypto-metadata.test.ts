import { describe, expect, it } from "vitest"
import { cryptoService } from "@/lib/crypto.client"

describe("Drop metadata encryption", () => {
    it("uses a distinct AES-GCM nonce domain for title and message", async () => {
        const keyString = await cryptoService.generateKey()
        const key = await cryptoService.importKey(keyString)
        const ivString = cryptoService.generateFileIv()
        const iv = new Uint8Array(cryptoService.base64UrlToArrayBuffer(ivString))

        const titleCiphertext = await cryptoService.encryptFilename("same plaintext", key, iv)
        const messageCiphertext = await cryptoService.encryptMessage("same plaintext", key, iv)

        expect(messageCiphertext).not.toBe(titleCiphertext)
        await expect(cryptoService.decryptFilename(titleCiphertext, key, iv)).resolves.toBe("same plaintext")
        await expect(cryptoService.decryptMessage(messageCiphertext, key, iv)).resolves.toBe("same plaintext")
    })

    it("still decrypts messages written by the legacy filename domain", async () => {
        const keyString = await cryptoService.generateKey()
        const key = await cryptoService.importKey(keyString)
        const ivString = cryptoService.generateFileIv()
        const iv = new Uint8Array(cryptoService.base64UrlToArrayBuffer(ivString))
        const legacyCiphertext = await cryptoService.encryptFilename("legacy message", key, iv)

        await expect(cryptoService.decryptMessage(legacyCiphertext, key, iv)).resolves.toBe("legacy message")
    })
})
