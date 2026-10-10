import type { useVault } from "@/components/vault/vault-provider"
import { decryptVaultText, encryptVaultText } from "@/lib/vault/crypto"

/**
 * Key selection for vault-encrypted alias labels/notes.
 *
 * Personal aliases use the member's personal vault key. Org-owned aliases are
 * shared by the team, so their metadata is encrypted with the team's org vault
 * key (the same key org Drop/Form owner keys are wrapped to) — otherwise only the
 * member who wrote a label could ever read it.
 *
 * Team labels written before this used the author's personal key, so reads in
 * org scope try the org key first and fall back to the personal key.
 */

type AliasMetadataVault = Pick<
    ReturnType<typeof useVault>,
    "status" | "getVaultKey" | "getOrgVaultKeyHandle"
>

type AliasMetadataContext = { aliasId: string; field: "label" | "note" }

export const TEAM_KEY_NOT_GRANTED_MESSAGE =
    "You don't have access to this team's encryption key yet. Ask a team admin to grant access."

export class AliasMetadataKeyError extends Error {
    constructor(message: string) {
        super(message)
        this.name = "AliasMetadataKeyError"
    }
}

export interface AliasMetadataWriteKey {
    key: CryptoKey
    /** Team key generation (org aliases only) — the server rejects stale ones. */
    orgKeyGeneration?: number
}

/**
 * The key NEW metadata for an alias must be encrypted with. Throws
 * AliasMetadataKeyError (with a user-facing message) when it isn't available —
 * callers must not fall back to the personal key for an org alias, or the label
 * would again be unreadable to the rest of the team.
 */
export async function getAliasMetadataWriteKey(
    vault: AliasMetadataVault,
    organizationId: string | null | undefined,
): Promise<AliasMetadataWriteKey> {
    const vaultKey = vault.status === "unlocked" ? vault.getVaultKey() : null
    if (!vaultKey) {
        throw new AliasMetadataKeyError("Unlock your vault to update labels and notes")
    }
    if (!organizationId) return { key: vaultKey }

    let handle: Awaited<ReturnType<AliasMetadataVault["getOrgVaultKeyHandle"]>>
    try {
        handle = await vault.getOrgVaultKeyHandle(organizationId)
    } catch {
        throw new AliasMetadataKeyError("Couldn't load this team's encryption key. Please try again.")
    }
    if (!handle) throw new AliasMetadataKeyError(TEAM_KEY_NOT_GRANTED_MESSAGE)
    return { key: handle.key, orgKeyGeneration: handle.generation }
}

/**
 * Keys to try, in order, when decrypting an alias's metadata. Empty when the
 * vault is locked. A missing/unavailable team key degrades to the personal key
 * (still able to read labels this member wrote under the old scheme).
 */
export async function getAliasMetadataReadKeys(
    vault: AliasMetadataVault,
    organizationId: string | null | undefined,
): Promise<CryptoKey[]> {
    const vaultKey = vault.status === "unlocked" ? vault.getVaultKey() : null
    if (!vaultKey) return []
    if (!organizationId) return [vaultKey]

    try {
        const handle = await vault.getOrgVaultKeyHandle(organizationId)
        return handle ? [handle.key, vaultKey] : [vaultKey]
    } catch {
        return [vaultKey]
    }
}

/** Decrypt with the first candidate key that authenticates the ciphertext. */
export async function decryptAliasMetadata(
    envelope: string,
    keys: CryptoKey[],
    context: AliasMetadataContext,
): Promise<string> {
    let lastError: unknown = new Error("No key available")
    for (const key of keys) {
        try {
            return await decryptVaultText(envelope, key, context)
        } catch (error) {
            lastError = error
        }
    }
    throw lastError
}

/**
 * Re-encrypt one org alias metadata envelope from the old org vault key to a
 * new one. For the org-key rotation flow (lib/vault/org-vault-client.ts
 * rotateOrgVaultKey), which must re-encrypt org alias labels/notes alongside the
 * Drop/Form owner keys or they become unreadable after a rotation.
 */
export async function rekeyAliasMetadata(
    envelope: string,
    oldKey: CryptoKey,
    newKey: CryptoKey,
    context: AliasMetadataContext,
): Promise<string> {
    const plaintext = await decryptVaultText(envelope, oldKey, context)
    return encryptVaultText(plaintext, newKey, context)
}
