import { afterAll, beforeAll, describe, expect, it } from "vitest"
import crypto from "crypto"

import { encryptField } from "@/lib/field-encryption"

// 32 bytes as 64 hex chars.
const TEST_KEY_HEX = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff"
const ENV = "FIELD_TEST_KEY"
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

/**
 * Decrypt using the same wire format encryptField produces. This mirrors what the
 * external Haraka mail server does to recover at-rest secrets (e.g. DKIM keys), so
 * the round-trip here is the contract test for that cross-service format.
 */
function decryptField(value: string, keyHex: string): string {
    const raw = value.replace(/^enc:/, "")
    const combined = Buffer.from(raw, "base64")
    const iv = combined.subarray(0, IV_LENGTH)
    const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH)
    const ciphertext = combined.subarray(IV_LENGTH, combined.length - AUTH_TAG_LENGTH)
    const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv)
    decipher.setAuthTag(authTag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")
}

describe("encryptField", () => {
    const originalKey = process.env[ENV]
    beforeAll(() => {
        process.env[ENV] = TEST_KEY_HEX
    })
    afterAll(() => {
        if (originalKey === undefined) delete process.env[ENV]
        else process.env[ENV] = originalKey
    })

    it("produces an enc:-prefixed value that round-trips back to the plaintext", () => {
        const plaintext = "-----BEGIN PRIVATE KEY-----\nMIIBVg..."
        const encrypted = encryptField(plaintext, ENV)

        expect(encrypted.startsWith("enc:")).toBe(true)
        expect(encrypted).not.toContain(plaintext)
        expect(decryptField(encrypted, TEST_KEY_HEX)).toBe(plaintext)
    })

    it("uses a fresh random IV so identical plaintexts encrypt differently", () => {
        const a = encryptField("same-secret", ENV)
        const b = encryptField("same-secret", ENV)

        expect(a).not.toBe(b)
        // ...yet both decrypt back to the same plaintext.
        expect(decryptField(a, TEST_KEY_HEX)).toBe("same-secret")
        expect(decryptField(b, TEST_KEY_HEX)).toBe("same-secret")
    })

    it("authenticates the ciphertext: a single flipped byte fails decryption", () => {
        const encrypted = encryptField("tamper-target", ENV)
        const raw = Buffer.from(encrypted.replace(/^enc:/, ""), "base64")
        // Flip a byte inside the ciphertext region (after the 12-byte IV).
        raw.writeUInt8(raw.readUInt8(IV_LENGTH + 1) ^ 0xff, IV_LENGTH + 1)
        const tampered = "enc:" + raw.toString("base64")

        expect(() => decryptField(tampered, TEST_KEY_HEX)).toThrow()
    })

    it("rejects a missing or malformed key env var", () => {
        delete process.env[ENV]
        expect(() => encryptField("x", ENV)).toThrow(/required/)

        process.env[ENV] = "not-hex"
        expect(() => encryptField("x", ENV)).toThrow(/64-character hex/)

        process.env[ENV] = TEST_KEY_HEX // restore for any later cases
    })
})
