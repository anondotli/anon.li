import crypto from "crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12

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
