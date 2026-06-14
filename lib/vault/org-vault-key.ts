/**
 * Org vault key for shared-team E2EE (ORG-E2EE-DESIGN.md §3b).
 *
 * The org vault key is a symmetric AES-256-GCM key shared across an org's
 * members. It is NEVER stored in plaintext — only sealed to each member's
 * identity public key (`OrganizationMemberKey.wrappedOrgVaultKey`). Org-owned
 * Drop/Form owner keys are wrapped to it (instead of one user's vault key) via
 * the existing `wrapVaultManagedKey`, so any member who can recover the org
 * vault key can open every org resource — and only those members.
 *
 * It is the same shape as a user vault key (extractable AES-256-GCM), so it
 * plugs directly into the existing owner-key wrapping. Pure client-side WebCrypto.
 */
import { openWithPrivateKey, sealToPublicKey, type SealedBox } from "@/lib/crypto/asymmetric"
import { base64UrlToArrayBuffer, exportKeyBase64Url, generateVaultKey } from "@/lib/vault/crypto"

/** HKDF domain separator for sealing the org vault key to member identity public keys. */
const ORG_VAULT_KEY_INFO = "anon.li/org-vault-key/v1"

/** Generate a fresh org vault key (extractable AES-256-GCM, same shape as a user vault key). */
export async function generateOrgVaultKey(): Promise<CryptoKey> {
    return generateVaultKey()
}

/**
 * Seal the org vault key to a member's identity public key, producing the
 * `wrappedOrgVaultKey` stored on their `OrganizationMemberKey`. Needs only the
 * member's PUBLIC key, so an admin can grant access while the member is offline.
 */
export async function wrapOrgVaultKeyForMember(
    orgVaultKey: CryptoKey,
    memberIdentityPublicKey: string,
): Promise<SealedBox> {
    const raw = base64UrlToArrayBuffer(await exportKeyBase64Url(orgVaultKey))
    return sealToPublicKey(memberIdentityPublicKey, raw, ORG_VAULT_KEY_INFO)
}

/**
 * Recover the org vault key from a member's sealed copy using their identity
 * private key (itself recovered from the vault on unlock). Returns an AES-GCM
 * key ready to unwrap org-owned owner keys.
 */
export async function unwrapOrgVaultKeyForMember(
    wrappedOrgVaultKey: SealedBox,
    memberIdentityPrivateKey: string,
): Promise<CryptoKey> {
    const raw = await openWithPrivateKey(memberIdentityPrivateKey, wrappedOrgVaultKey, ORG_VAULT_KEY_INFO)
    return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, true, ["encrypt", "decrypt"])
}
