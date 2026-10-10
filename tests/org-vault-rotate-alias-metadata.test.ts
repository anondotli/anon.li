/**
 * @vitest-environment node
 *
 * Org alias labels/notes are encrypted with the org vault key, so a team key
 * rotation must re-encrypt them — and must leave legacy personal-key envelopes
 * (which don't open with the org key) untouched instead of failing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    readVaultApiData: vi.fn(),
    rekeyAliasMetadata: vi.fn(),
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
vi.mock("@/components/alias/alias-metadata-key", () => ({ rekeyAliasMetadata: mocks.rekeyAliasMetadata }))
vi.mock("@/lib/vault/identity-keypair", () => ({ recoverIdentityPrivateKey: vi.fn(async () => "identity-private-key") }))
vi.mock("@/lib/vault/org-vault-key", () => ({
    generateOrgVaultKey: vi.fn(async () => NEW_KEY),
    unwrapOrgVaultKeyForMember: mocks.unwrapOrgVaultKeyForMember,
    wrapOrgVaultKeyForMember: vi.fn(),
}))
vi.mock("@/lib/vault/sync", () => ({ broadcastVaultMessage: vi.fn() }))

const CURRENT_KEY = { name: "current" } as unknown as CryptoKey
const NEW_KEY = { name: "new" } as unknown as CryptoKey

import { clearOrgVaultKeyCache, rotateOrgVaultKey } from "@/lib/vault/org-vault-client"
import { VaultApiError } from "@/lib/vault/client"
import { hashCiphertext } from "@/lib/vault/ciphertext-hash"

const sealed = JSON.stringify({ ephemeralPublicKey: "A".repeat(87), iv: "B".repeat(16), ciphertext: "C".repeat(40) })
let postedBody: Record<string, unknown> | null
let postResponses: Array<() => unknown>

beforeEach(() => {
    vi.clearAllMocks()
    clearOrgVaultKeyCache()
    postedBody = null
    postResponses = []
    mocks.unwrapOrgVaultKeyForMember.mockResolvedValue(CURRENT_KEY)
    mocks.readVaultApiData.mockImplementation(async (input: string, init?: RequestInit) => {
        if (input.startsWith("/api/vault/org-keys?")) {
            return { memberKey: { wrappedOrgVaultKey: sealed, orgKeyGeneration: 1 }, currentGeneration: 1 }
        }
        if (input === "/api/vault/identity") {
            return { identityPublicKey: "P".repeat(88), wrappedIdentityPrivateKey: "W".repeat(120), identityKeyGeneration: 1 }
        }
        if (input.startsWith("/api/vault/org-keys/members")) return { members: [] }
        if (input.startsWith("/api/vault/org-keys/rekey?")) {
            return {
                dropKeys: [],
                formKeys: [],
                aliasMetadata: [
                    { id: "a1", encryptedLabel: "org-label", encryptedNote: "org-note" },
                    { id: "a2", encryptedLabel: "legacy-personal-label", encryptedNote: null },
                    { id: "a3", encryptedLabel: "legacy-personal-label", encryptedNote: "org-note" },
                ],
            }
        }
        if (input === "/api/vault/org-keys/rekey" && init?.method === "POST") {
            postedBody = JSON.parse(String(init.body)) as Record<string, unknown>
            return (postResponses.shift() ?? (() => ({ ok: true })))()
        }
        throw new Error(`unexpected ${input}`)
    })
    mocks.rekeyAliasMetadata.mockImplementation(async (envelope: string, oldKey: CryptoKey, newKey: CryptoKey, ctx: { aliasId: string; field: string }) => {
        if (envelope.startsWith("legacy")) throw new DOMException("bad", "OperationError")
        expect(oldKey).toBe(CURRENT_KEY)
        expect(newKey).toBe(NEW_KEY)
        return `rekeyed:${ctx.aliasId}:${ctx.field}`
    })
})

describe("rotateOrgVaultKey alias metadata", () => {
    it("re-encrypts org-key fields and omits legacy personal-key fields", async () => {
        await rotateOrgVaultKey("org-1", {} as CryptoKey)

        expect(mocks.rekeyAliasMetadata).toHaveBeenCalledWith("org-label", CURRENT_KEY, NEW_KEY, { aliasId: "a1", field: "label" })
        const orgLabel = await hashCiphertext("org-label")
        const orgNote = await hashCiphertext("org-note")
        const legacy = await hashCiphertext("legacy-personal-label")
        // Every listed alias is echoed with hashes of what was seen (so the
        // server can detect edits in between); legacy fields get no new value.
        expect(postedBody?.aliasMetadata).toEqual([
            {
                id: "a1",
                previousLabelHash: orgLabel,
                previousNoteHash: orgNote,
                encryptedLabel: "rekeyed:a1:label",
                encryptedNote: "rekeyed:a1:note",
            },
            { id: "a2", previousLabelHash: legacy, previousNoteHash: null },
            { id: "a3", previousLabelHash: legacy, previousNoteHash: orgNote, encryptedNote: "rekeyed:a3:note" },
        ])
    })

    it("re-prepares and retries once when the server reports ROTATION_DATA_CHANGED", async () => {
        postResponses = [() => {
            throw new VaultApiError("Rotation data changed", "ROTATION_DATA_CHANGED")
        }]

        await expect(rotateOrgVaultKey("org-1", {} as CryptoKey)).resolves.toMatchObject({ generation: 2 })

        const rekeyGets = mocks.readVaultApiData.mock.calls.filter(([input]) => String(input).startsWith("/api/vault/org-keys/rekey?"))
        expect(rekeyGets).toHaveLength(2)
    })

    it("does not retry other conflicts (e.g. a concurrent rotation)", async () => {
        postResponses = [() => {
            throw new VaultApiError("Concurrent rotation", "CONFLICT")
        }]

        await expect(rotateOrgVaultKey("org-1", {} as CryptoKey)).rejects.toThrow("Concurrent rotation")
        const posts = mocks.readVaultApiData.mock.calls.filter(([input, init]) => input === "/api/vault/org-keys/rekey" && init?.method === "POST")
        expect(posts).toHaveLength(1)
    })
})
