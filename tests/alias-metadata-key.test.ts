/**
 * @vitest-environment jsdom
 *
 * Team alias labels/notes are encrypted with the team's org vault key (so every
 * granted member can read them), never with the acting member's personal key.
 * Reads fall back to the personal key for labels written under the old scheme.
 */
import { describe, expect, it, vi } from "vitest"

import { encryptVaultText, generateVaultKey } from "@/lib/vault/crypto"
import {
    AliasMetadataKeyError,
    TEAM_KEY_NOT_GRANTED_MESSAGE,
    decryptAliasMetadata,
    getAliasMetadataReadKeys,
    getAliasMetadataWriteKey,
    rekeyAliasMetadata,
} from "@/components/alias/alias-metadata-key"

const context = { aliasId: "alias-1", field: "label" as const }

async function makeVault(opts: { orgKey?: CryptoKey | null; status?: "unlocked" | "locked"; orgError?: boolean } = {}) {
    const personalKey = await generateVaultKey()
    const vault = {
        status: opts.status ?? "unlocked",
        getVaultKey: () => personalKey,
        getOrgVaultKeyHandle: vi.fn(async () => {
            if (opts.orgError) throw new Error("network")
            return opts.orgKey ? { key: opts.orgKey, generation: 1 } : null
        }),
    } as unknown as Parameters<typeof getAliasMetadataWriteKey>[0]
    return { vault, personalKey }
}

describe("alias metadata key selection", () => {
    it("uses the personal vault key for personal aliases", async () => {
        const { vault, personalKey } = await makeVault()

        await expect(getAliasMetadataWriteKey(vault, null)).resolves.toEqual({ key: personalKey })
        expect(vault.getOrgVaultKeyHandle).not.toHaveBeenCalled()
    })

    it("uses the org vault key for org aliases so other members can decrypt", async () => {
        const orgKey = await generateVaultKey()
        const { vault: author } = await makeVault({ orgKey })
        const { vault: teammate } = await makeVault({ orgKey })

        const writeKey = await getAliasMetadataWriteKey(author, "org-1")
        expect(writeKey).toEqual({ key: orgKey, orgKeyGeneration: 1 })
        expect(author.getOrgVaultKeyHandle).toHaveBeenCalledWith("org-1")

        const envelope = await encryptVaultText("Shopping", writeKey.key, context)
        const readKeys = await getAliasMetadataReadKeys(teammate, "org-1")
        await expect(decryptAliasMetadata(envelope, readKeys, context)).resolves.toBe("Shopping")
    })

    it("refuses to fall back to the personal key when the team key isn't granted", async () => {
        const { vault } = await makeVault({ orgKey: null })

        await expect(getAliasMetadataWriteKey(vault, "org-1")).rejects.toThrow(TEAM_KEY_NOT_GRANTED_MESSAGE)
        await expect(getAliasMetadataWriteKey(vault, "org-1")).rejects.toBeInstanceOf(AliasMetadataKeyError)
    })

    it("refuses when the vault is locked", async () => {
        const { vault } = await makeVault({ status: "locked" })

        await expect(getAliasMetadataWriteKey(vault, null)).rejects.toBeInstanceOf(AliasMetadataKeyError)
        await expect(getAliasMetadataReadKeys(vault, null)).resolves.toEqual([])
    })

    it("reads legacy personal-key team labels via fallback", async () => {
        const orgKey = await generateVaultKey()
        const { vault, personalKey } = await makeVault({ orgKey })
        const legacyEnvelope = await encryptVaultText("Old label", personalKey, context)

        const keys = await getAliasMetadataReadKeys(vault, "org-1")
        expect(keys).toEqual([orgKey, personalKey])
        await expect(decryptAliasMetadata(legacyEnvelope, keys, context)).resolves.toBe("Old label")
    })

    it("degrades to the personal key if the team key can't be fetched", async () => {
        const { vault, personalKey } = await makeVault({ orgError: true })

        await expect(getAliasMetadataReadKeys(vault, "org-1")).resolves.toEqual([personalKey])
    })

    it("fails closed when no candidate key authenticates the ciphertext", async () => {
        const otherKey = await generateVaultKey()
        const { vault } = await makeVault({ orgKey: null })
        const envelope = await encryptVaultText("secret", otherKey, context)

        const keys = await getAliasMetadataReadKeys(vault, "org-1")
        await expect(decryptAliasMetadata(envelope, keys, context)).rejects.toBeTruthy()
    })

    it("re-encrypts metadata from an old org key to a new one (rotation helper)", async () => {
        const oldKey = await generateVaultKey()
        const newKey = await generateVaultKey()
        const envelope = await encryptVaultText("Billing", oldKey, context)

        const rekeyed = await rekeyAliasMetadata(envelope, oldKey, newKey, context)

        await expect(decryptAliasMetadata(rekeyed, [newKey], context)).resolves.toBe("Billing")
        await expect(decryptAliasMetadata(rekeyed, [oldKey], context)).rejects.toBeTruthy()
    })
})
