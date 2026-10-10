/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/vault/storage-support", () => ({
    getVaultStorageSupport: () => ({ indexedDb: true, localStorage: true, trustedBrowser: true }),
}))

import { storeDeviceKey } from "@/lib/vault/trusted-browser"

type Handler = (() => void) | null

/** Just enough IndexedDB for open → put; every request succeeds on a microtask. */
function installFakeIndexedDb() {
    const rows = new Map<string, unknown>()
    const request = <T>(result: T) => {
        const req = { result, error: null, onsuccess: null as Handler, onerror: null as Handler }
        queueMicrotask(() => req.onsuccess?.())
        return req
    }
    const database = {
        objectStoreNames: { contains: () => true },
        createObjectStore: vi.fn(),
        close: vi.fn(),
        transaction: () => ({
            onerror: null as Handler,
            objectStore: () => ({
                put: (value: unknown, key: string) => {
                    rows.set(key, value)
                    return request(key)
                },
            }),
        }),
    }
    vi.stubGlobal("indexedDB", {
        open: () => {
            const req = { result: database, error: null, onsuccess: null as Handler, onerror: null as Handler, onupgradeneeded: null as Handler }
            queueMicrotask(() => req.onsuccess?.())
            return req
        },
    })
    return rows
}

afterEach(() => {
    vi.unstubAllGlobals()
})

describe("storeDeviceKey", () => {
    it("does not wait for the browser's persistent-storage prompt", async () => {
        const rows = installFakeIndexedDb()
        // Firefox resolves persist() only once the user answers a prompt.
        const persist = vi.fn(() => new Promise<boolean>(() => {}))
        vi.stubGlobal("navigator", { ...navigator, storage: { persist } })
        const key = { type: "secret" } as unknown as CryptoKey

        const outcome = await Promise.race([
            storeDeviceKey(key).then(() => "stored"),
            new Promise((resolve) => setTimeout(() => resolve("hung"), 200)),
        ])

        expect(outcome).toBe("stored")
        expect(persist).toHaveBeenCalled()
        expect(rows.get("current")).toBe(key)
    })

    it("tolerates a rejected persistence request", async () => {
        installFakeIndexedDb()
        vi.stubGlobal("navigator", { ...navigator, storage: { persist: () => Promise.reject(new Error("denied")) } })
        await expect(storeDeviceKey({} as CryptoKey)).resolves.toBeUndefined()
    })
})
