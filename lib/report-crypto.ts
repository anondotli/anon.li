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
    } catch {
        // If decryption fails, it's likely a plaintext key from before encryption was enabled
        logger.warn("Failed to decrypt report key, returning as-is (likely plaintext)")
        return value
    }
}
