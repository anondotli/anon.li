/**
 * User identity keypair for org shared-E2EE (see lib/vault/ORG-E2EE-DESIGN.md §3a).
 *
 * Each user has a P-256 ECDH "identity" keypair. The PUBLIC key is published
 * (anyone may seal an org vault key *to* it); the PRIVATE key is wrapped under
 * the user's symmetric vault key and is only recoverable after the vault is
 * unlocked. This is the bridge that lets an admin grant org access to a member
 * **offline**, using only the member's public key.
 *
 * Distinct from `lib/vault/identity.ts`, which is vault *session* identity
 * (vaultId/generation assertion) — unrelated to this asymmetric keypair.
 *
 * Pure client-side WebCrypto: build the wrapped material from an unlocked
 * `vaultKey` at setup, and recover the usable private key on unlock. The server
 * only ever stores `identityPublicKey` (plaintext) + the wrapped private key
 * (ciphertext) — never a plaintext private key.
 */
import { generateKeypair } from "@/lib/crypto/asymmetric"
import {
    arrayBufferToBase64Url,
    base64UrlToArrayBuffer,
    unwrapVaultPayload,
    wrapVaultPayload,
} from "@/lib/vault/crypto"

/** AES-GCM AAD binding the wrapped identity private key to its purpose (domain separation). */
const IDENTITY_PRIVATE_KEY_AAD = new TextEncoder().encode("anon.li:identity-private-key:v1")

export interface StoredIdentityKeypair {
    /** base64url raw P-256 public key — stored in plaintext (UserSecurity.identityPublicKey). */
    identityPublicKey: string
    /** PKCS#8 private key wrapped to the vault key (UserSecurity.wrappedIdentityPrivateKey). */
    wrappedIdentityPrivateKey: string
}

/**
 * Generate a fresh identity keypair and wrap its private key to `vaultKey`.
 * Returns exactly what should be persisted on the user's security record.
 */
export async function provisionIdentityKeypair(vaultKey: CryptoKey): Promise<StoredIdentityKeypair> {
    const { publicKey, privateKey } = await generateKeypair()
    const privateKeyBytes = base64UrlToArrayBuffer(privateKey)
    const wrappedIdentityPrivateKey = await wrapVaultPayload(privateKeyBytes, vaultKey, IDENTITY_PRIVATE_KEY_AAD)
    return { identityPublicKey: publicKey, wrappedIdentityPrivateKey }
}

/**
 * Recover the usable (base64url PKCS#8) identity private key from its wrapped
 * form, given the unlocked `vaultKey`. The result is the `privateKey` string
 * accepted by `openWithPrivateKey`. Throws if `vaultKey` is wrong (AES-GCM auth).
 */
export async function recoverIdentityPrivateKey(
    wrappedIdentityPrivateKey: string,
    vaultKey: CryptoKey,
): Promise<string> {
    const privateKeyBytes = await unwrapVaultPayload(wrappedIdentityPrivateKey, vaultKey, IDENTITY_PRIVATE_KEY_AAD)
    return arrayBufferToBase64Url(privateKeyBytes)
}
