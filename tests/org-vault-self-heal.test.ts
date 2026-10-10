/**
 * @vitest-environment node
 *
 * Self-heal for members whose org grant was sealed to an identity key they no
 * longer hold: only an AES-GCM authentication failure (OperationError) opening
 * the sealed box releases the grant, and the release names the exact grant
 * (generation + hash) so the server can compare-and-delete. Network failures,
 * a wrong vault key and malformed grant data never release anything.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    readVaultApiData: vi.fn(),
    recoverIdentityPrivateKey: vi.fn(),
    unwrapOrgVaultKeyForMember: vi.fn(),
}))

vi.mock("@/lib/vault/client", () => ({
    readVaultApiData: mocks.readVaultApiData,
    VaultApiError: class VaultApiError extends Error {
        constructor(message: string, readonly code: string) {
            super(message)
        }
    },
}))
vi.mock("@/lib/vault/identity-keypair", () => ({ recoverIdentityPrivateKey: mocks.recoverIdentityPrivateKey }))
vi.mock("@/lib/vault/org-vault-key", () => ({
    generateOrgVaultKey: vi.fn(),
    unwrapOrgVaultKeyForMember: mocks.unwrapOrgVaultKeyForMember,
    wrapOrgVaultKeyForMember: vi.fn(),
}))
vi.mock("@/lib/vault/sync", () => ({ broadcastVaultMessage: vi.fn() }))
vi.mock("@/components/alias/alias-metadata-key", () => ({ rekeyAliasMetadata: vi.fn() }))

import {
    bootstrapOrgVault,
    clearOrgVaultKeyCache,
    getOrgKeyAccessState,
    getOrgVaultKey,
    observeOrgKeyGeneration,
    withOrgKeyGenerationRetry,
} from "@/lib/vault/org-vault-client"
import { VaultApiError } from "@/lib/vault/client"
import { hashCiphertext } from "@/lib/vault/ciphertext-hash"

const vaultKey = {} as CryptoKey
const sealed = JSON.stringify({
    ephemeralPublicKey: "A".repeat(87),
    iv: "B".repeat(16),
    ciphertext: "C".repeat(40),
})
const operationError = () => new DOMException("bad", "OperationError")

let memberKeyRow: { wrappedOrgVaultKey: string; orgKeyGeneration: number } | null
let currentGeneration: number
let releaseResponse: () => unknown

function routeApi() {
    mocks.readVaultApiData.mockImplementation(async (input: string, init?: RequestInit) => {
        if (input.startsWith("/api/vault/org-keys/own")) {
            expect(init?.method).toBe("DELETE")
            return releaseResponse()
        }
        if (input.startsWith("/api/vault/org-keys?")) return { memberKey: memberKeyRow, currentGeneration }
        if (input === "/api/vault/identity") {
            return { identityPublicKey: "P".repeat(88), wrappedIdentityPrivateKey: "W".repeat(120), identityKeyGeneration: 1 }
        }
        throw new Error(`unexpected ${input}`)
    })
}

const releaseCalls = () =>
    mocks.readVaultApiData.mock.calls.filter(([input]) => String(input).startsWith("/api/vault/org-keys/own"))

beforeEach(() => {
    vi.clearAllMocks()
    clearOrgVaultKeyCache()
    memberKeyRow = { wrappedOrgVaultKey: sealed, orgKeyGeneration: 1 }
    currentGeneration = 1
    releaseResponse = () => {
        memberKeyRow = null
        return { released: 1 }
    }
    mocks.recoverIdentityPrivateKey.mockResolvedValue("identity-private-key")
    mocks.unwrapOrgVaultKeyForMember.mockReset()
    routeApi()
})

describe("org vault grant self-heal", () => {
    it("releases exactly the grant that failed to open and reports regrant-required (org-a)", async () => {
        mocks.unwrapOrgVaultKeyForMember.mockRejectedValue(operationError())

        expect(await getOrgVaultKey("org-a", vaultKey)).toBeNull()
        expect(releaseCalls()).toHaveLength(1)
        const url = new URL(String(releaseCalls()[0]![0]), "https://x")
        expect(url.searchParams.get("organizationId")).toBe("org-a")
        expect(url.searchParams.get("orgKeyGeneration")).toBe("1")
        expect(url.searchParams.get("wrappedKeyHash")).toBe(await hashCiphertext(sealed))

        // Afterwards the server reports no grant; the state stays explained.
        expect(await getOrgKeyAccessState("org-a", vaultKey)).toBe("regrant-required")
        expect(await bootstrapOrgVault({ orgId: "org-a", vaultKey, canManage: false }))
            .toEqual({ status: "regrant-required", grantedCount: 0 })
        expect(releaseCalls()).toHaveLength(1)
    })

    it("does not release on a network failure fetching the grant (org-b)", async () => {
        mocks.readVaultApiData.mockRejectedValueOnce(new TypeError("Failed to fetch"))

        await expect(getOrgVaultKey("org-b", vaultKey)).rejects.toThrow("Failed to fetch")
        expect(releaseCalls()).toHaveLength(0)
    })

    it("does not release when the identity key itself fails to open (wrong vault key) (org-c)", async () => {
        mocks.recoverIdentityPrivateKey.mockRejectedValue(operationError())

        await expect(getOrgVaultKey("org-c", vaultKey)).rejects.toThrow()
        expect(releaseCalls()).toHaveLength(0)
    })

    it("does not release on malformed grant data (org-d)", async () => {
        memberKeyRow = { wrappedOrgVaultKey: "{not-a-sealed-box", orgKeyGeneration: 1 }

        await expect(getOrgVaultKey("org-d", vaultKey)).rejects.toThrow()
        expect(releaseCalls()).toHaveLength(0)
    })

    it("does not release on a non-authentication crypto error, e.g. bad key data (org-e)", async () => {
        mocks.unwrapOrgVaultKeyForMember.mockRejectedValue(new DOMException("bad point", "DataError"))

        await expect(getOrgVaultKey("org-e", vaultKey)).rejects.toThrow()
        expect(releaseCalls()).toHaveLength(0)
    })

    it("reports key-unrecoverable and stops retrying when the server refuses as last holder (org-f)", async () => {
        mocks.unwrapOrgVaultKeyForMember.mockRejectedValue(operationError())
        releaseResponse = () => {
            throw new VaultApiError("last holder", "ORG_KEY_LAST_HOLDER")
        }

        expect(await getOrgKeyAccessState("org-f", vaultKey)).toBe("key-unrecoverable")
        expect(await getOrgKeyAccessState("org-f", vaultKey)).toBe("key-unrecoverable")
        expect(releaseCalls()).toHaveLength(1)
        expect(await bootstrapOrgVault({ orgId: "org-f", vaultKey, canManage: false }))
            .toEqual({ status: "key-unrecoverable", grantedCount: 0 })
    })

    it("re-resolves once when the grant changed before the release (org-g)", async () => {
        const orgKey = {} as CryptoKey
        mocks.unwrapOrgVaultKeyForMember
            .mockRejectedValueOnce(operationError())
            .mockResolvedValueOnce(orgKey)
        releaseResponse = () => {
            // An admin re-granted in the meantime: server keeps the row.
            memberKeyRow = { wrappedOrgVaultKey: sealed, orgKeyGeneration: 1 }
            throw new VaultApiError("changed", "CONFLICT")
        }

        expect(await getOrgVaultKey("org-g", vaultKey)).toEqual({ key: orgKey, generation: 1 })
    })

    it("grants normally when the grant opens (org-h)", async () => {
        const orgKey = {} as CryptoKey
        mocks.unwrapOrgVaultKeyForMember.mockResolvedValue(orgKey)

        expect(await getOrgVaultKey("org-h", vaultKey)).toEqual({ key: orgKey, generation: 1 })
        expect(releaseCalls()).toHaveLength(0)
    })
})

describe("cached org key invalidation", () => {
    it("evicts a cached handle when a newer org key generation is observed", async () => {
        const oldKey = { v: 1 } as unknown as CryptoKey
        const newKey = { v: 2 } as unknown as CryptoKey
        mocks.unwrapOrgVaultKeyForMember.mockResolvedValueOnce(oldKey).mockResolvedValueOnce(newKey)

        expect((await getOrgVaultKey("org-r", vaultKey))?.key).toBe(oldKey)

        observeOrgKeyGeneration("org-r", 1) // same generation: keep
        expect((await getOrgVaultKey("org-r", vaultKey))?.key).toBe(oldKey)

        memberKeyRow = { wrappedOrgVaultKey: sealed, orgKeyGeneration: 2 }
        currentGeneration = 2
        observeOrgKeyGeneration("org-r", 2) // rotated elsewhere: evict
        expect(await getOrgVaultKey("org-r", vaultKey)).toEqual({ key: newKey, generation: 2 })
    })

    it("withOrgKeyGenerationRetry clears the cached key and retries once on ORG_KEY_GENERATION_MISMATCH", async () => {
        const keys = [{ v: 1 }, { v: 2 }] as unknown as CryptoKey[]
        mocks.unwrapOrgVaultKeyForMember.mockResolvedValueOnce(keys[0]).mockResolvedValueOnce(keys[1])
        const usedKeys: CryptoKey[] = []

        const result = await withOrgKeyGenerationRetry("org-s", async () => {
            const handle = await getOrgVaultKey("org-s", vaultKey)
            usedKeys.push(handle!.key)
            return usedKeys.length === 1 ? { error: "Team encryption key changed", code: "ORG_KEY_GENERATION_MISMATCH" } : { success: true }
        })

        expect(result).toEqual({ success: true })
        expect(usedKeys).toEqual(keys)
    })

    it("withOrgKeyGenerationRetry handles a thrown mismatch and gives up after one retry", async () => {
        mocks.unwrapOrgVaultKeyForMember.mockResolvedValue({} as CryptoKey)
        const attempt = vi.fn(async () => {
            throw new VaultApiError("Team encryption key changed", "ORG_KEY_GENERATION_MISMATCH")
        })

        await expect(withOrgKeyGenerationRetry("org-t", attempt)).rejects.toThrow("Team encryption key changed")
        expect(attempt).toHaveBeenCalledTimes(2)
    })

    it("withOrgKeyGenerationRetry does not retry other errors", async () => {
        const attempt = vi.fn(async () => {
            throw new VaultApiError("nope", "FORBIDDEN")
        })
        await expect(withOrgKeyGenerationRetry("org-u", attempt)).rejects.toThrow("nope")
        expect(attempt).toHaveBeenCalledTimes(1)
    })
})
