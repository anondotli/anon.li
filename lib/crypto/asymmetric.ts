/**
 * Hybrid asymmetric encryption (sealed box) over WebCrypto ECDH P-256.
 *
 * Why P-256 (not X25519): WebCrypto ECDH P-256 is universally supported by
 * the browsers in our browserslist. X25519 is not available in Safari < 17.
 *
 * Sealed-box protocol (anonymous sender → recipient public key):
 *   1. Recipient holds a long-lived P-256 keypair; its public key is published.
 *   2. Sender generates an ephemeral P-256 keypair, does ECDH with the recipient
 *      public key to derive a shared secret, runs HKDF-SHA256 (with a
 *      caller-supplied `info` for domain separation) to derive an AES-256-GCM
 *      key, and encrypts the payload.
 *   3. Sender emits { ephemeralPublicKey, iv, ciphertext } and discards the
 *      ephemeral private key. There is no sender authentication — which is
 *      exactly what an *offline grant* needs: anyone can seal *to* a public key,
 *      only the holder of the matching private key can open.
 *   4. Recipient does ECDH(privateKey, ephemeralPublicKey), runs the same HKDF,
 *      and decrypts.
 *
 * Used by Form submissions (per-form keypair) and, via the same primitive, the
 * org shared-E2EE grants (see lib/vault/ORG-E2EE-DESIGN.md §10.1). Form and org
 * deliberately share one audited primitive.
 *
 * This module runs identically on server and client (WebCrypto only).
 */

const ECDH_PARAMS: EcKeyGenParams & EcKeyImportParams = { name: "ECDH", namedCurve: "P-256" }
const AES_PARAMS: AesKeyAlgorithm = { name: "AES-GCM", length: 256 }

/** HKDF `info` (domain separation) for Form submission encryption. Do not change — wire-compatibility. */
const FORM_HKDF_INFO = "anon.li/form-submission/v1"

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

// ─────────────────────────────── Keypair ───────────────────────────────

export interface KeypairExport {
    publicKey: string        // base64url raw (65-byte uncompressed P-256)
    privateKey: string       // base64url PKCS#8
}

/** Back-compat alias for the original Form-specific name. */
export type FormKeypairExport = KeypairExport

/** Generate a P-256 ECDH keypair, exported as base64url (raw public, PKCS#8 private). */
export async function generateKeypair(): Promise<KeypairExport> {
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

/** Back-compat alias for Form callers (builder-page). */
export const generateFormKeypair = generateKeypair

async function importPublicKey(raw: string): Promise<CryptoKey> {
    return crypto.subtle.importKey("raw", b64UrlToBuf(raw), ECDH_PARAMS, true, [])
}

async function importPrivateKey(pkcs8: string): Promise<CryptoKey> {
    return crypto.subtle.importKey("pkcs8", b64UrlToBuf(pkcs8), ECDH_PARAMS, false, ["deriveBits"])
}

async function deriveAesKey(priv: CryptoKey, pub: CryptoKey, info: BufferSource): Promise<CryptoKey> {
    const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: pub }, priv, 256)
    const hkdfKey = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"])
    return crypto.subtle.deriveKey(
        { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info },
        hkdfKey,
        AES_PARAMS,
        false,
        ["encrypt", "decrypt"],
    )
}

// ───────────────────────────── Sealed box ──────────────────────────────

export interface SealedBox {
    ephemeralPublicKey: string   // base64url raw P-256
    iv: string                   // base64url, 12 bytes
    ciphertext: string           // base64url AES-256-GCM
}

/**
 * Seal `plaintext` to a recipient's P-256 public key. `info` is the HKDF domain
 * separator — callers MUST use a distinct, stable string per use (e.g.
 * "anon.li/org-vault-key/v1") so a box sealed for one purpose can't be opened
 * with a key derived for another.
 */
export async function sealToPublicKey(
    recipientPublicKey: string,
    plaintext: BufferSource,
    info: string,
): Promise<SealedBox> {
    const recipientPub = await importPublicKey(recipientPublicKey)
    const ephemeral = await crypto.subtle.generateKey(ECDH_PARAMS, true, ["deriveBits"])
    const aesKey = await deriveAesKey(ephemeral.privateKey, recipientPub, new TextEncoder().encode(info))
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, plaintext)
    const rawPub = await crypto.subtle.exportKey("raw", ephemeral.publicKey)
    return {
        ephemeralPublicKey: bufToB64Url(rawPub),
        iv: bufToB64Url(iv),
        ciphertext: bufToB64Url(cipher),
    }
}

/** Open a sealed box with the recipient's P-256 private key. Returns raw plaintext bytes. */
export async function openWithPrivateKey(
    recipientPrivateKey: string,
    box: SealedBox,
    info: string,
): Promise<ArrayBuffer> {
    const priv = await importPrivateKey(recipientPrivateKey)
    const ephPub = await importPublicKey(box.ephemeralPublicKey)
    const aesKey = await deriveAesKey(priv, ephPub, new TextEncoder().encode(info))
    return crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(b64UrlToBuf(box.iv)) },
        aesKey,
        b64UrlToBuf(box.ciphertext),
    )
}

// ──────────────── Form submission wrappers (wire format preserved) ──────

export interface EncryptedSubmission {
    ephemeralPubKey: string
    iv: string
    encryptedPayload: string
}

export async function encryptForForm(formPublicKey: string, plaintext: string): Promise<EncryptedSubmission> {
    const box = await sealToPublicKey(formPublicKey, new TextEncoder().encode(plaintext), FORM_HKDF_INFO)
    return { ephemeralPubKey: box.ephemeralPublicKey, iv: box.iv, encryptedPayload: box.ciphertext }
}

export async function decryptFromSubmission(
    formPrivateKey: string,
    submission: EncryptedSubmission,
): Promise<string> {
    const plain = await openWithPrivateKey(
        formPrivateKey,
        { ephemeralPublicKey: submission.ephemeralPubKey, iv: submission.iv, ciphertext: submission.encryptedPayload },
        FORM_HKDF_INFO,
    )
    return new TextDecoder().decode(plain)
}
