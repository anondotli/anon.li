import crypto from "crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

// Prefix to detect whether a value is encrypted
const ENCRYPTED_PREFIX = "enc:"

function getKey(envVar: string): Buffer {
    const key = process.env[envVar]
    if (!key) {
        throw new Error(`${envVar} environment variable is required`)
    }
    if (key.length !== 64 || !/^[0-9a-f]+$/i.test(key)) {
        throw new Error(`${envVar} must be a 64-character hex string (32 bytes)`)
    }
    return Buffer.from(key, "hex")
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns "enc:" + base64(IV + ciphertext + authTag).
 */
export function encryptField(plaintext: string, envVar: string): string {
    const key = getKey(envVar)
    const iv = crypto.randomBytes(IV_LENGTH)
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

    const encrypted = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
    ])
    const authTag = cipher.getAuthTag()
    const combined = Buffer.concat([iv, encrypted, authTag])

    return ENCRYPTED_PREFIX + combined.toString("base64")
}

/**
 * Decrypt a field encrypted with encryptField.
 */
export function decryptField(value: string, envVar: string): string {
    if (!value.startsWith(ENCRYPTED_PREFIX)) {
        // Plaintext value from before encryption was enabled
        return value
    }

    const key = getKey(envVar)
    const combined = Buffer.from(value.slice(ENCRYPTED_PREFIX.length), "base64")

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

