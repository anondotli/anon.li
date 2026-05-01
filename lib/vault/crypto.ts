"use client"

import { argon2id } from "hash-wasm"
import {
    ARGON2_HASH_LENGTH,
    ARGON2_MEMORY,
    ARGON2_PARALLELISM,
    ARGON2_TIME,
} from "@/lib/constants"

const AES_GCM_ALGORITHM = { name: "AES-GCM", length: 256 } as const
const AES_KW_ALGORITHM = { name: "AES-KW", length: 256 } as const
const SALT_BYTES = 32
const TEXT_IV_BYTES = 12

type VaultTextField = "label" | "note"

interface VaultEncryptedTextEnvelope {
    v: 1
    alg: "AES-256-GCM"
    iv: string
    ct: string
}

type BinaryLike = ArrayBufferLike | ArrayBufferView

function toUint8Array(value: BinaryLike): Uint8Array {
    if (value instanceof Uint8Array) return value
    if (ArrayBuffer.isView(value)) {
        return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    }

    return new Uint8Array(value)
}

function toArrayBuffer(value: BinaryLike): ArrayBuffer {
    const bytes = toUint8Array(value)
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function toCryptoBufferSource(value: BinaryLike): BufferSource {
    const bytes = toUint8Array(value)

    if (typeof Buffer !== "undefined") {
        return Buffer.from(bytes)
    }

    return toArrayBuffer(bytes)
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

async function deriveBytes(password: string, salt: string | Uint8Array): Promise<Uint8Array> {
    const saltBytes = typeof salt === "string"
        ? new Uint8Array(base64UrlToArrayBuffer(salt))
        : salt

    const output = await argon2id({
        password,
        salt: saltBytes,
        memorySize: ARGON2_MEMORY,
        iterations: ARGON2_TIME,
        parallelism: ARGON2_PARALLELISM,
        hashLength: ARGON2_HASH_LENGTH,
        outputType: "binary",
    })

    return new Uint8Array(output)
}

async function importAesKwKey(raw: BinaryLike, extractable = false) {
    return crypto.subtle.importKey(
        "raw",
        toCryptoBufferSource(raw),
        AES_KW_ALGORITHM,
        extractable,
        ["wrapKey", "unwrapKey"],
    )
}

async function importAesGcmKey(raw: BinaryLike, extractable = true): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        "raw",
        toCryptoBufferSource(raw),
        AES_GCM_ALGORITHM,
        extractable,
        ["encrypt", "decrypt"],
    )
}

export async function deriveAuthSecret(password: string, authSalt: string): Promise<Uint8Array> {
    return deriveBytes(password, authSalt)
}

export async function derivePasswordKEK(password: string, vaultSalt: string): Promise<CryptoKey> {
    const raw = await deriveBytes(password, vaultSalt)
    return importAesKwKey(raw, false)
}

export async function generateVaultKey(): Promise<CryptoKey> {
    return crypto.subtle.generateKey(AES_GCM_ALGORITHM, true, ["encrypt", "decrypt"])
}

async function exportKeyBytes(key: CryptoKey): Promise<ArrayBuffer> {
    return crypto.subtle.exportKey("raw", key)
}

export async function wrapVaultKey(vaultKey: CryptoKey, wrappingKey: CryptoKey): Promise<ArrayBuffer> {
    return crypto.subtle.wrapKey("raw", vaultKey, wrappingKey, "AES-KW")
}

export async function unwrapVaultKey(wrappedKey: BinaryLike, unwrappingKey: CryptoKey): Promise<CryptoKey> {
    return crypto.subtle.unwrapKey(
        "raw",
        toCryptoBufferSource(wrappedKey),
        unwrappingKey,
        "AES-KW",
        AES_GCM_ALGORITHM,
        true,
        ["encrypt", "decrypt"],
    )
}

export function generateSalt(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(SALT_BYTES))
}

export async function generateDeviceWrappingKey(): Promise<CryptoKey> {
    return crypto.subtle.generateKey(AES_KW_ALGORITHM, false, ["wrapKey", "unwrapKey"])
}

async function getVaultWrappingKey(vaultKey: CryptoKey): Promise<CryptoKey> {
    const rawVaultKey = await exportKeyBytes(vaultKey)
    return importAesKwKey(rawVaultKey, false)
}

export async function wrapVaultManagedKey(rawKey: BinaryLike, vaultKey: CryptoKey): Promise<string> {
    const wrappingKey = await getVaultWrappingKey(vaultKey)
    const keyToWrap = await importAesGcmKey(rawKey, true)
    const wrapped = await crypto.subtle.wrapKey("raw", keyToWrap, wrappingKey, "AES-KW")
    return arrayBufferToBase64Url(wrapped)
}

export async function unwrapVaultManagedKey(wrappedKey: string, vaultKey: CryptoKey): Promise<CryptoKey> {
    const wrappingKey = await getVaultWrappingKey(vaultKey)
    return crypto.subtle.unwrapKey(
        "raw",
        toCryptoBufferSource(base64UrlToArrayBuffer(wrappedKey)),
        wrappingKey,
        "AES-KW",
        AES_GCM_ALGORITHM,
        true,
        ["encrypt", "decrypt"],
    )
}

export async function exportKeyBase64Url(key: CryptoKey): Promise<string> {
    return arrayBufferToBase64Url(await exportKeyBytes(key))
}

// Wrap an arbitrary-size payload (e.g. a PKCS#8 private key) under the vault
// key using AES-GCM. Unlike `wrapVaultManagedKey`, this is not restricted to
// AES key sizes and can carry any payload up to a few KB.
const FORM_KEY_IV_BYTES = 12
const FORM_KEY_AAD = new TextEncoder().encode("anon.li:form-owner-key:v1")

export async function wrapVaultPayload(data: BinaryLike, vaultKey: CryptoKey): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(FORM_KEY_IV_BYTES))
    const cipher = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: toCryptoBufferSource(iv), additionalData: toCryptoBufferSource(FORM_KEY_AAD) },
        vaultKey,
        toCryptoBufferSource(data),
    )
    // Packed layout: [iv | ciphertext] — both fields recoverable since iv is fixed length.
    const cipherBytes = new Uint8Array(cipher)
    const packed = new Uint8Array(iv.byteLength + cipherBytes.byteLength)
    packed.set(iv, 0)
    packed.set(cipherBytes, iv.byteLength)
    return arrayBufferToBase64Url(packed)
}

export async function unwrapVaultPayload(wrapped: string, vaultKey: CryptoKey): Promise<ArrayBuffer> {
    const packed = new Uint8Array(base64UrlToArrayBuffer(wrapped))
    if (packed.byteLength <= FORM_KEY_IV_BYTES) {
        throw new Error("Wrapped payload is too short")
    }
    const iv = packed.slice(0, FORM_KEY_IV_BYTES)
    const cipher = packed.slice(FORM_KEY_IV_BYTES)
    return crypto.subtle.decrypt(
        { name: "AES-GCM", iv: toCryptoBufferSource(iv), additionalData: toCryptoBufferSource(FORM_KEY_AAD) },
        vaultKey,
        toCryptoBufferSource(cipher),
    )
}

export function extractStoredKeyMaterial(keyString: string): ArrayBuffer {
    const encoded = keyString.startsWith("derived:")
        ? keyString.split(":")[2] ?? ""
        : keyString

    return base64UrlToArrayBuffer(encoded)
}

function aliasMetadataAad(aliasId: string, field: VaultTextField): Uint8Array {
    return new TextEncoder().encode(`anon.li:alias-metadata:v1:${aliasId}:${field}`)
}

export async function encryptVaultText(
    plaintext: string,
    vaultKey: CryptoKey,
    context: { aliasId: string; field: VaultTextField },
): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(TEXT_IV_BYTES))
    const encoded = new TextEncoder().encode(plaintext)
    const ciphertext = await crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: toCryptoBufferSource(iv),
            additionalData: toCryptoBufferSource(aliasMetadataAad(context.aliasId, context.field)),
        },
        vaultKey,
        toCryptoBufferSource(encoded),
    )

    const envelope: VaultEncryptedTextEnvelope = {
        v: 1,
        alg: "AES-256-GCM",
        iv: arrayBufferToBase64Url(iv),
        ct: arrayBufferToBase64Url(ciphertext),
    }

    return JSON.stringify(envelope)
}

export async function decryptVaultText(
    envelopeJson: string,
    vaultKey: CryptoKey,
    context: { aliasId: string; field: VaultTextField },
): Promise<string> {
    const envelope = JSON.parse(envelopeJson) as Partial<VaultEncryptedTextEnvelope>
    if (envelope.v !== 1 || envelope.alg !== "AES-256-GCM" || !envelope.iv || !envelope.ct) {
        throw new Error("Invalid encrypted text envelope")
    }

    const plaintext = await crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: toCryptoBufferSource(base64UrlToArrayBuffer(envelope.iv)),
            additionalData: toCryptoBufferSource(aliasMetadataAad(context.aliasId, context.field)),
        },
        vaultKey,
        toCryptoBufferSource(base64UrlToArrayBuffer(envelope.ct)),
    )

    return new TextDecoder().decode(plaintext)
}
