import crypto from "crypto"

const VERSION = 0x01
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16
const ALGORITHM = "aes-256-gcm"
const HKDF_INFO = "reply-token-v1"
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60 // 7 days

let cachedKey: Buffer | null = null

function deriveKey(): Buffer {
    if (cachedKey) return cachedKey

    const secret = process.env.MAIL_API_SECRET
    if (!secret) {
        throw new Error("MAIL_API_SECRET environment variable is required")
    }

    cachedKey = Buffer.from(crypto.hkdfSync(
        "sha256",
        secret,
        Buffer.alloc(0), // no salt
        HKDF_INFO,
        32,
    ))

    return cachedKey
}

/** For testing only — clears the cached derived key */
export function _clearKeyCache(): void {
    cachedKey = null
}

export function createReplyToken(
    sender: string,
    aliasEmail: string,
    recipient: string,
): string {
    const key = deriveKey()
    const iv = crypto.randomBytes(IV_LENGTH)

    const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS
    const expiryBuf = Buffer.alloc(4)
    expiryBuf.writeUInt32BE(expiresAt, 0)

    const plaintext = Buffer.concat([
        expiryBuf,
        Buffer.from(sender, "utf8"), Buffer.from([0]),
        Buffer.from(aliasEmail, "utf8"), Buffer.from([0]),
        Buffer.from(recipient, "utf8"), Buffer.from([0]),
    ])

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
    const authTag = cipher.getAuthTag()

    const combined = Buffer.concat([
        Buffer.from([VERSION]),
        iv,
        encrypted,
        authTag,
    ])

    return combined.toString("base64url")
}

interface DecodedReplyToken {
    originalSender: string
    aliasEmail: string
    recipientEmail: string
    expiresAt: Date
}

export function decodeReplyToken(token: string): DecodedReplyToken | null {
    try {
        const buf = Buffer.from(token, "base64url")

        const minLength = 1 + IV_LENGTH + 4 + 3 + AUTH_TAG_LENGTH // version + iv + expiry + 3 null terminators + tag
        if (buf.length < minLength) return null

        if (buf[0] !== VERSION) return null

        const iv = buf.subarray(1, 1 + IV_LENGTH)
        const authTag = buf.subarray(buf.length - AUTH_TAG_LENGTH)
        const ciphertext = buf.subarray(1 + IV_LENGTH, buf.length - AUTH_TAG_LENGTH)

        const key = deriveKey()
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
        decipher.setAuthTag(authTag)

        const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])

        const expiresAtUnix = plaintext.readUInt32BE(0)
        if (expiresAtUnix < Math.floor(Date.now() / 1000)) return null // expired

        // Parse null-terminated strings after the 4-byte expiry
        const strings: string[] = []
        let start = 4
        for (let i = 4; i < plaintext.length; i++) {
            if (plaintext[i] === 0) {
                strings.push(plaintext.subarray(start, i).toString("utf8"))
                start = i + 1
            }
        }

        if (strings.length !== 3) return null

        return {
            originalSender: strings[0]!,
            aliasEmail: strings[1]!,
            recipientEmail: strings[2]!,
            expiresAt: new Date(expiresAtUnix * 1000),
        }
    } catch {
        return null
    }
}
