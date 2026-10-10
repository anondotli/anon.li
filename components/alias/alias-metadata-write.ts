import type { useVault } from "@/components/vault/vault-provider"
import { updateAliasEncryptedMetadataAction } from "@/actions/alias"
import { withOrgKeyGenerationRetry } from "@/lib/vault/org-vault-client"
import { encryptVaultText } from "@/lib/vault/crypto"
import type { ActionState } from "@/lib/safe-action"
import { getAliasMetadataWriteKey } from "@/components/alias/alias-metadata-key"

type AliasMetadataVault = Parameters<typeof getAliasMetadataWriteKey>[0]

/**
 * Encrypt and save an alias's label and/or note.
 *
 * Fields: a string is encrypted and stored, `null` clears the field, and an
 * omitted field is left untouched. Org aliases are encrypted with the team key
 * and carry its generation; if the server reports ORG_KEY_GENERATION_MISMATCH
 * (a cached key from before a rotation), withOrgKeyGenerationRetry drops the
 * cached team key and the write is re-encrypted with a freshly fetched key and
 * retried once.
 *
 * Throws AliasMetadataKeyError when no suitable key is available.
 */
export async function saveAliasMetadata(
    vault: AliasMetadataVault | ReturnType<typeof useVault>,
    alias: { id: string; organizationId?: string | null },
    fields: { label?: string | null; note?: string | null },
    options: { clearLegacyLabel?: boolean; clearLegacyNote?: boolean } = {},
): Promise<ActionState> {
    // Fetches the write key (and, for org aliases, the team key handle) on
    // every invocation so a retry re-encrypts with the current generation.
    const attempt = async (): Promise<ActionState> => {
        const { key, orgKeyGeneration } = await getAliasMetadataWriteKey(vault, alias.organizationId)

        const payload: Parameters<typeof updateAliasEncryptedMetadataAction>[1] = { ...options }
        if (fields.label !== undefined) {
            payload.encryptedLabel = fields.label === null
                ? null
                : await encryptVaultText(fields.label, key, { aliasId: alias.id, field: "label" })
        }
        if (fields.note !== undefined) {
            payload.encryptedNote = fields.note === null
                ? null
                : await encryptVaultText(fields.note, key, { aliasId: alias.id, field: "note" })
        }
        if (orgKeyGeneration !== undefined) payload.orgKeyGeneration = orgKeyGeneration

        return updateAliasEncryptedMetadataAction(alias.id, payload)
    }

    return alias.organizationId
        ? withOrgKeyGenerationRetry(alias.organizationId, attempt)
        : attempt()
}
