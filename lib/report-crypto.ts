import crypto from "crypto"
import { createLogger } from "@/lib/logger"

const logger = createLogger("ReportCrypto")

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

function getEncryptionKey(): Buffer {
    const key = process.env.REPORT_ENCRYPTION_KEY
    if (!key) {
        throw new Error("REPORT_ENCRYPTION_KEY environment variable is required")
    }
    // Expect a 64-char hex string (32 bytes)
    if (key.length !== 64 || !/^[0-9a-f]+$/i.test(key)) {
        throw new Error("REPORT_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)")
    }
    return Buffer.from(key, "hex")
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a base64-encoded string: IV + ciphertext + auth tag.
 */
export function encryptReportKey(plaintext: string): string {
    const key = getEncryptionKey()
    const iv = crypto.randomBytes(IV_LENGTH)
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

    const encrypted = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
    ])
    const authTag = cipher.getAuthTag()

    // Format: IV (12) + ciphertext (variable) + authTag (16)
    const combined = Buffer.concat([iv, encrypted, authTag])
    return combined.toString("base64")
}

/**
 * Decrypt a base64-encoded string encrypted with encryptReportKey.
 */
function decryptReportKey(encrypted: string): string {
    const key = getEncryptionKey()
    const combined = Buffer.from(encrypted, "base64")

    if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH) {
        throw new Error("Invalid encrypted data: too short")
    }

    const iv = combined.subarray(0, IV_LENGTH)
    const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH)
    const ciphertext = combined.subarray(IV_LENGTH, combined.length - AUTH_TAG_LENGTH)

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)

    const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
    ])

    return decrypted.toString("utf8")
}

/**
 * Try to decrypt a report key. If it fails (e.g., plaintext key from before encryption was enabled),
 * returns the original string.
 */
export function safeDecryptReportKey(value: string): string {
    try {
        return decryptReportKey(value)
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        // Distinguish a benign legacy plaintext key (stored before encryption was
        // enabled) from a real key-management failure. A value that base64-decodes
        // to at least our IV+authTag overhead is in ciphertext format, so a decrypt
        // failure means a rotated/misconfigured REPORT_ENCRYPTION_KEY or corrupted
        // data — log it at error level so it can be alerted on. Otherwise abuse
        // investigators would silently receive an undecryptable key with no signal.
        const looksLikeCiphertext = Buffer.from(value, "base64").length >= IV_LENGTH + AUTH_TAG_LENGTH
        if (looksLikeCiphertext) {
            logger.error("Report key failed to decrypt despite ciphertext format; check REPORT_ENCRYPTION_KEY", { error: message })
        } else {
            logger.warn("Report key not in encrypted format, returning as-is (legacy plaintext)")
        }
        return value
    }
}
