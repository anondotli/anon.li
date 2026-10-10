/**
 * SHA-256 (base64url, 43 chars) of a stored ciphertext string. Isomorphic
 * (WebCrypto in both browser and Node) so the client and the server compute the
 * exact same value — used as a compact "the ciphertext I saw" token for
 * compare-and-swap writes (rotation, grant self-release).
 */
export async function hashCiphertext(value: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
    let binary = ""
    for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte)
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/** `hashCiphertext` for a nullable column (null stays null). */
export async function hashNullableCiphertext(value: string | null): Promise<string | null> {
    return value === null ? null : hashCiphertext(value)
}

export const CIPHERTEXT_HASH_PATTERN = /^[A-Za-z0-9_-]{43}$/
