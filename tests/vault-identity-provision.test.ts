/**
 * @vitest-environment node
 *
 * Orchestration contract for ensureIdentityKeypair: it provisions + publishes a
 * keypair only when none exists or the stored one is stale, and is otherwise a
 * no-op. (Wiring it fail-open into the unlock flow is the provider's job.)
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const { readVaultApiData, provisionIdentityKeypair } = vi.hoisted(() => ({
    readVaultApiData: vi.fn(),
    provisionIdentityKeypair: vi.fn(),
}))

vi.mock("@/lib/vault/client", () => ({ readVaultApiData }))
vi.mock("@/lib/vault/identity-keypair", () => ({ provisionIdentityKeypair }))

import { ensureIdentityKeypair } from "@/lib/vault/identity-keys-client"

const vaultKey = {} as unknown as CryptoKey

beforeEach(() => {
    vi.clearAllMocks()
})

describe("ensureIdentityKeypair", () => {
    it("no-ops when an up-to-date keypair already exists", async () => {
        readVaultApiData.mockResolvedValueOnce({
            identityPublicKey: "EXISTING_PUB",
            wrappedIdentityPrivateKey: "wrapped",
            identityKeyGeneration: 4,
        })

        const result = await ensureIdentityKeypair(vaultKey, 4, "vault-1")

        expect(result).toBe("EXISTING_PUB")
        expect(provisionIdentityKeypair).not.toHaveBeenCalled()
        expect(readVaultApiData).toHaveBeenCalledTimes(1) // GET only, no POST
    })

    it("provisions + publishes when no keypair exists yet", async () => {
        readVaultApiData
            .mockResolvedValueOnce({ identityPublicKey: null, wrappedIdentityPrivateKey: null, identityKeyGeneration: null })
            .mockResolvedValueOnce({ identityPublicKey: "NEW_PUB" })
        provisionIdentityKeypair.mockResolvedValue({
            identityPublicKey: "NEW_PUB",
            wrappedIdentityPrivateKey: "NEW_WRAPPED",
        })

        const result = await ensureIdentityKeypair(vaultKey, 1, "vault-1")

        expect(provisionIdentityKeypair).toHaveBeenCalledWith(vaultKey)
        expect(result).toBe("NEW_PUB")

        const [, postInit] = readVaultApiData.mock.calls[1]!
        expect(postInit.method).toBe("POST")
        expect(JSON.parse(postInit.body)).toEqual({
            identityPublicKey: "NEW_PUB",
            wrappedIdentityPrivateKey: "NEW_WRAPPED",
            vaultId: "vault-1",
            vaultGeneration: 1,
        })
    })

    it("re-provisions when the stored keypair is stale (different generation)", async () => {
        readVaultApiData
            .mockResolvedValueOnce({ identityPublicKey: "OLD_PUB", wrappedIdentityPrivateKey: "old", identityKeyGeneration: 2 })
            .mockResolvedValueOnce({ identityPublicKey: "ROTATED_PUB" })
        provisionIdentityKeypair.mockResolvedValue({
            identityPublicKey: "ROTATED_PUB",
            wrappedIdentityPrivateKey: "ROTATED_WRAPPED",
        })

        const result = await ensureIdentityKeypair(vaultKey, 3, "vault-1") // current gen 3, stored gen 2

        expect(provisionIdentityKeypair).toHaveBeenCalledOnce()
        expect(result).toBe("ROTATED_PUB")
        expect(readVaultApiData).toHaveBeenCalledTimes(2) // GET + POST
    })
})
