/**
 * base64url encoding/decoding primitives.
 *
 * Single source of truth shared by the Drop crypto service (`lib/crypto.client.ts`)
 * and the vault crypto module (`lib/vault/crypto.ts`), which previously each had
 * their own byte-identical copies.
 */

type BinaryLike = ArrayBufferLike | ArrayBufferView

export function toUint8Array(value: BinaryLike): Uint8Array {
    if (value instanceof Uint8Array) return value
    if (ArrayBuffer.isView(value)) {
        return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    }
    return new Uint8Array(value)
}

export function arrayBufferToBase64Url(value: BinaryLike): string {
    const bytes = toUint8Array(value)
    let binary = ""
    for (const byte of bytes) {
        binary += String.fromCharCode(byte)
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

export function base64UrlToArrayBuffer(value: string): ArrayBuffer {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index++) {
        bytes[index] = binary.charCodeAt(index)
    }
    return bytes.buffer
}
