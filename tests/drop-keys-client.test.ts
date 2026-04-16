/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const readVaultApiData = vi.fn()

vi.mock("@/lib/vault/client", () => ({
    readVaultApiData: (input: string, init?: RequestInit) => init === undefined
        ? readVaultApiData(input)
        : readVaultApiData(input, init),
}))

describe("drop-keys client cache", () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        vi.resetModules()
    })

    it("reuses the cached key list instead of refetching immediately", async () => {
        readVaultApiData.mockResolvedValue([
            { dropId: "drop-1", wrappedKey: "wrapped-1", vaultGeneration: 1 },
        ])

        const { fetchWrappedDropKeys } = await import("@/lib/vault/drop-keys-client")

        const first = await fetchWrappedDropKeys()
        const second = await fetchWrappedDropKeys()

        expect(first).toEqual(second)
        expect(readVaultApiData).toHaveBeenCalledTimes(1)
        expect(readVaultApiData).toHaveBeenCalledWith("/api/vault/drop-keys")
    })

    it("seeds the cache with newly uploaded keys", async () => {
        const { clearWrappedDropKeysCache, fetchWrappedDropKey, upsertCachedWrappedDropKey } = await import("@/lib/vault/drop-keys-client")

        clearWrappedDropKeysCache()
        upsertCachedWrappedDropKey({
            dropId: "drop-new",
            wrappedKey: "wrapped-new",
            vaultGeneration: 2,
        })

        const record = await fetchWrappedDropKey("drop-new")

        expect(record).toEqual({
            dropId: "drop-new",
            wrappedKey: "wrapped-new",
            vaultGeneration: 2,
        })
        expect(readVaultApiData).not.toHaveBeenCalled()
    })
})
