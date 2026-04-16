/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest"

import {
    arrayBufferToBase64Url,
    base64UrlToArrayBuffer,
    decryptVaultText,
    deriveAuthSecret,
    derivePasswordKEK,
    encryptVaultText,
    exportKeyBase64Url,
    extractStoredKeyMaterial,
    generateSalt,
    generateVaultKey,
    wrapVaultKey,
    unwrapVaultKey,
} from "@/lib/vault/crypto"

describe("vault crypto integration", () => {
    it("derives deterministic auth secrets from password and salt", async () => {
        const salt = arrayBufferToBase64Url(generateSalt())

        const first = await deriveAuthSecret("correct horse battery staple", salt)
        const second = await deriveAuthSecret("correct horse battery staple", salt)

        expect(arrayBufferToBase64Url(first)).toBe(arrayBufferToBase64Url(second))
    })

    it("round-trips wrapped vault keys with a matching KEK and rejects the wrong KEK", async () => {
        const salt = arrayBufferToBase64Url(generateSalt())
        const correctKek = await derivePasswordKEK("password-1", salt)
        const matchingKek = await derivePasswordKEK("password-1", salt)
        const wrongKek = await derivePasswordKEK("password-2", salt)
        const vaultKey = await generateVaultKey()

        const wrapped = await wrapVaultKey(vaultKey, correctKek)
        const unwrapped = await unwrapVaultKey(wrapped, matchingKek)

        expect(await exportKeyBase64Url(unwrapped)).toBe(await exportKeyBase64Url(vaultKey))
        await expect(unwrapVaultKey(wrapped, wrongKek)).rejects.toBeTruthy()
    })

    it("round-trips encrypted text and rejects AAD context mismatches", async () => {
        const vaultKey = await generateVaultKey()
        const encrypted = await encryptVaultText("private", vaultKey, {
            aliasId: "alias-1",
            field: "note",
        })

        await expect(decryptVaultText(encrypted, vaultKey, {
            aliasId: "alias-1",
            field: "note",
        })).resolves.toBe("private")

        await expect(decryptVaultText(encrypted, vaultKey, {
            aliasId: "alias-2",
            field: "note",
        })).rejects.toBeTruthy()
    })

    it("supports legacy derived key material and rejects malformed inputs", () => {
        const raw = generateSalt()
        const encoded = arrayBufferToBase64Url(raw)

        expect(arrayBufferToBase64Url(extractStoredKeyMaterial(encoded))).toBe(encoded)
        expect(arrayBufferToBase64Url(extractStoredKeyMaterial(`derived:v1:${encoded}`))).toBe(encoded)

        for (const candidate of ["%", "derived:v1:%", "derived:v1:%%%"]) {
            expect(() => extractStoredKeyMaterial(candidate)).toThrow()
        }

        expect(arrayBufferToBase64Url(base64UrlToArrayBuffer(encoded))).toBe(encoded)
    })
})
