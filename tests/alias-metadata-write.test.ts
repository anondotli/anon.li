/**
 * @vitest-environment jsdom
 *
 * Org alias metadata writes carry the team key generation; when the server
 * says it's stale (a cached key from before a rotation), the write is retried
 * exactly once (withOrgKeyGenerationRetry) with a freshly fetched key.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    updateAliasEncryptedMetadataAction: vi.fn(),
}))

vi.mock("@/actions/alias", () => ({ updateAliasEncryptedMetadataAction: mocks.updateAliasEncryptedMetadataAction }))
// The real withOrgKeyGenerationRetry from lib/vault/org-vault-client is used.

import { generateVaultKey } from "@/lib/vault/crypto"
import { saveAliasMetadata } from "@/components/alias/alias-metadata-write"
import { ORG_KEY_GENERATION_MISMATCH_CODE } from "@/lib/vault/error-codes"

const mismatch = { error: "Team encryption key changed — please retry", code: ORG_KEY_GENERATION_MISMATCH_CODE }

async function makeVault(generations: number[]) {
    const personalKey = await generateVaultKey()
    const orgKey = await generateVaultKey()
    const getOrgVaultKeyHandle = vi.fn()
    for (const generation of generations) {
        getOrgVaultKeyHandle.mockResolvedValueOnce({ key: orgKey, generation })
    }
    return {
        status: "unlocked" as const,
        getVaultKey: () => personalKey,
        getOrgVaultKeyHandle,
    }
}

describe("saveAliasMetadata", () => {
    beforeEach(() => vi.clearAllMocks())

    it("sends the team key generation with org ciphertext", async () => {
        mocks.updateAliasEncryptedMetadataAction.mockResolvedValue({ success: true })
        const vault = await makeVault([4])

        await saveAliasMetadata(vault, { id: "a1", organizationId: "org-1" }, { label: "Billing" }, { clearLegacyLabel: true })

        expect(mocks.updateAliasEncryptedMetadataAction).toHaveBeenCalledWith("a1", expect.objectContaining({
            encryptedLabel: expect.any(String),
            clearLegacyLabel: true,
            orgKeyGeneration: 4,
        }))
    })

    it("re-fetches the team key and retries once on a generation mismatch", async () => {
        mocks.updateAliasEncryptedMetadataAction
            .mockResolvedValueOnce(mismatch)
            .mockResolvedValueOnce({ success: true })
        const vault = await makeVault([4, 5])

        const result = await saveAliasMetadata(vault, { id: "a1", organizationId: "org-1" }, { note: "n" })

        expect(result).toEqual({ success: true })
        expect(vault.getOrgVaultKeyHandle).toHaveBeenCalledTimes(2)
        expect(mocks.updateAliasEncryptedMetadataAction).toHaveBeenCalledTimes(2)
        expect(mocks.updateAliasEncryptedMetadataAction.mock.calls[1]![1]).toMatchObject({ orgKeyGeneration: 5 })
    })

    it("gives up after one retry", async () => {
        mocks.updateAliasEncryptedMetadataAction.mockResolvedValue(mismatch)
        const vault = await makeVault([4, 4])

        const result = await saveAliasMetadata(vault, { id: "a1", organizationId: "org-1" }, { label: "x" })

        expect(result).toEqual(mismatch)
        expect(mocks.updateAliasEncryptedMetadataAction).toHaveBeenCalledTimes(2)
    })

    it("leaves personal aliases unchanged (no generation, no retry)", async () => {
        mocks.updateAliasEncryptedMetadataAction.mockResolvedValue({ success: true })
        const vault = await makeVault([])

        await saveAliasMetadata(vault, { id: "a1", organizationId: null }, { label: null })

        expect(vault.getOrgVaultKeyHandle).not.toHaveBeenCalled()
        expect(mocks.updateAliasEncryptedMetadataAction).toHaveBeenCalledWith("a1", { encryptedLabel: null })
    })
})
