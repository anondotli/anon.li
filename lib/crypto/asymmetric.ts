/**
 * Hybrid asymmetric encryption for Form submissions.
 *
 * Why P-256 (not X25519): WebCrypto ECDH P-256 is universally supported by
 * the browsers in our browserslist. X25519 is not available in Safari < 17.
 *
 * Protocol:
 *   1. Form creator generates a P-256 keypair on form creation.
 *   2. Public key is served with the public form page; private key is wrapped
 *      with the vault key and persisted in FormOwnerKey.
 *   3. Each submitter generates an ephemeral P-256 keypair, does ECDH with
 *      the form public key to derive a shared secret, runs HKDF-SHA256 to
 *      derive an AES-256-GCM key, and encrypts the submission payload.
 *   4. The submitter sends { ephemeralPubKey, iv, encryptedPayload } and
 *      discards the ephemeral private key.
 *   5. The creator unwraps the private key, does ECDH with ephemeralPubKey,
 *      runs HKDF, and decrypts.
 *
 * This module runs identically on server and client (WebCrypto only).
 */

const ECDH_PARAMS: EcKeyGenParams & EcKeyImportParams = { name: "ECDH", namedCurve: "P-256" }
const AES_PARAMS: AesKeyAlgorithm = { name: "AES-GCM", length: 256 }
const HKDF_INFO = new TextEncoder().encode("anon.li/form-submission/v1")

function bufToB64Url(buf: ArrayBuffer | Uint8Array): string {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
    let bin = ""
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function b64UrlToBuf(s: string): ArrayBuffer {
    let b64 = s.replace(/-/g, "+").replace(/_/g, "/")
    while (b64.length % 4) b64 += "="
    const bin = atob(b64)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out.buffer
}

export interface FormKeypairExport {
    publicKey: string        // base64url raw (65-byte uncompressed P-256)
    privateKey: string       // base64url PKCS#8
}

export async function generateFormKeypair(): Promise<FormKeypairExport> {
    const pair = await crypto.subtle.generateKey(ECDH_PARAMS, true, ["deriveBits"])
    const [pub, priv] = await Promise.all([
        crypto.subtle.exportKey("raw", pair.publicKey),
        crypto.subtle.exportKey("pkcs8", pair.privateKey),
    ])
    return {
        publicKey: bufToB64Url(pub),
        privateKey: bufToB64Url(priv),
    }
}

async function importPublicKey(raw: string): Promise<CryptoKey> {
    return crypto.subtle.importKey("raw", b64UrlToBuf(raw), ECDH_PARAMS, true, [])
}

async function importPrivateKey(pkcs8: string): Promise<CryptoKey> {
    return crypto.subtle.importKey("pkcs8", b64UrlToBuf(pkcs8), ECDH_PARAMS, false, ["deriveBits"])
}

async function deriveAesKey(priv: CryptoKey, pub: CryptoKey): Promise<CryptoKey> {
    const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: pub }, priv, 256)
    const hkdfKey = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"])
    return crypto.subtle.deriveKey(
        { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: HKDF_INFO },
        hkdfKey,
        AES_PARAMS,
        false,
        ["encrypt", "decrypt"],
    )
}

export interface EncryptedSubmission {
    ephemeralPubKey: string
    iv: string
    encryptedPayload: string
}

export async function encryptForForm(formPublicKey: string, plaintext: string): Promise<EncryptedSubmission> {
    const formPub = await importPublicKey(formPublicKey)
    const ephemeral = await crypto.subtle.generateKey(ECDH_PARAMS, true, ["deriveBits"])
    const aesKey = await deriveAesKey(ephemeral.privateKey, formPub)
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const cipher = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        aesKey,
        new TextEncoder().encode(plaintext),
    )
    const rawPub = await crypto.subtle.exportKey("raw", ephemeral.publicKey)
    return {
        ephemeralPubKey: bufToB64Url(rawPub),
        iv: bufToB64Url(iv),
        encryptedPayload: bufToB64Url(cipher),
    }
}

export async function decryptFromSubmission(
    formPrivateKey: string,
    submission: EncryptedSubmission,
): Promise<string> {
    const priv = await importPrivateKey(formPrivateKey)
    const ephPub = await importPublicKey(submission.ephemeralPubKey)
    const aesKey = await deriveAesKey(priv, ephPub)
    const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(b64UrlToBuf(submission.iv)) },
        aesKey,
        b64UrlToBuf(submission.encryptedPayload),
    )
    return new TextDecoder().decode(plain)
}

export const __internal = { bufToB64Url, b64UrlToBuf }
