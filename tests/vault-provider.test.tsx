/**
 * @vitest-environment jsdom
 */
import * as React from "react"
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const getVaultRuntime = vi.fn()
const setVaultRuntime = vi.fn()
const clearVaultRuntime = vi.fn()
const getVaultStorageSupport = vi.fn()
const clearTrustedBrowserState = vi.fn()
const getDeviceKey = vi.fn()
const readCapsule = vi.fn()
const persistTrustedBrowser = vi.fn()
const readVaultApiData = vi.fn()
const createVaultTabId = vi.fn(() => "tab-1")
const subscribeToVaultSync = vi.fn<(callback: unknown) => () => void>(() => () => {})
const broadcastVaultMessage = vi.fn()
const base64UrlToArrayBuffer = vi.fn(() => new ArrayBuffer(32))
const callBroadcastVaultMessage = broadcastVaultMessage as unknown as (message: unknown) => void
const callBase64UrlToArrayBuffer = base64UrlToArrayBuffer as unknown as (value: string) => ArrayBuffer
const derivePasswordKEK = vi.fn()
const sha256Base64Url = vi.fn()
const unwrapVaultKey = vi.fn()
const unwrapVaultManagedKey = vi.fn()
const wrapVaultManagedKey = vi.fn()
let syncCallback: ((message: unknown) => void) | null = null

vi.mock("@/lib/vault/runtime", () => ({
    getVaultRuntime: () => getVaultRuntime(),
    setVaultRuntime: (key: CryptoKey, vaultGeneration: number, vaultId: string) => setVaultRuntime(key, vaultGeneration, vaultId),
    clearVaultRuntime: () => clearVaultRuntime(),
}))

vi.mock("@/lib/vault/storage-support", () => ({
    getVaultStorageSupport: () => getVaultStorageSupport(),
}))

vi.mock("@/lib/vault/trusted-browser", () => ({
    clearTrustedBrowserState: () => clearTrustedBrowserState(),
    getDeviceKey: () => getDeviceKey(),
    readCapsule: () => readCapsule(),
}))

vi.mock("@/lib/vault/client", () => ({
    persistTrustedBrowser: (vaultKey: CryptoKey, vaultGeneration: number, vaultId: string) => persistTrustedBrowser(vaultKey, vaultGeneration, vaultId),
    readVaultApiData: (input: string, init?: RequestInit) => readVaultApiData(input, init),
}))

vi.mock("@/lib/vault/sync", () => ({
    createVaultTabId: () => createVaultTabId(),
    subscribeToVaultSync: (callback: unknown) => subscribeToVaultSync(callback),
    broadcastVaultMessage: (message: unknown) => callBroadcastVaultMessage(message),
}))

vi.mock("@/lib/vault/crypto", () => ({
    base64UrlToArrayBuffer: (value: string) => callBase64UrlToArrayBuffer(value),
    derivePasswordKEK: (password: string, salt: string) => derivePasswordKEK(password, salt),
    sha256Base64Url: (value: string) => sha256Base64Url(value),
    unwrapVaultKey: (wrappedKey: ArrayBuffer, wrappingKey: CryptoKey) => unwrapVaultKey(wrappedKey, wrappingKey),
    unwrapVaultManagedKey: (wrappedKey: string, vaultKey: CryptoKey) => unwrapVaultManagedKey(wrappedKey, vaultKey),
    wrapVaultManagedKey: (rawKey: ArrayBuffer, vaultKey: CryptoKey) => wrapVaultManagedKey(rawKey, vaultKey),
}))

describe("VaultProvider", () => {
    beforeEach(() => {
        vi.useFakeTimers()
        cleanup()
        syncCallback = null

        getVaultRuntime.mockReset()
        setVaultRuntime.mockReset()
        clearVaultRuntime.mockReset()
        getVaultStorageSupport.mockReset()
        clearTrustedBrowserState.mockReset()
        getDeviceKey.mockReset()
        readCapsule.mockReset()
        persistTrustedBrowser.mockReset()
        readVaultApiData.mockReset()
        createVaultTabId.mockClear()
        subscribeToVaultSync.mockClear()
        broadcastVaultMessage.mockReset()
        base64UrlToArrayBuffer.mockClear()
        derivePasswordKEK.mockReset()
        sha256Base64Url.mockReset()
        unwrapVaultKey.mockReset()
        unwrapVaultManagedKey.mockReset()
        wrapVaultManagedKey.mockReset()

        getVaultStorageSupport.mockReturnValue({
            cryptoSubtle: true,
            indexedDb: true,
            localStorage: true,
            trustedBrowser: true,
            vault: true,
        })
        subscribeToVaultSync.mockImplementation((callback: unknown) => {
            syncCallback = callback as (message: unknown) => void
            return () => {}
        })
    })

    afterEach(() => {
        cleanup()
        vi.runOnlyPendingTimers()
        vi.useRealTimers()
    })

    it("starts unlocked when the vault runtime is already present", async () => {
        getVaultRuntime.mockReturnValue({
            key: {} as CryptoKey,
            vaultGeneration: 3,
            vaultId: "vault-123",
        })

        const { VaultProvider, useVault } = await import("@/components/vault/vault-provider")
        function Probe() {
            const { status } = useVault()
            return <div>{status}</div>
        }

        render(
            <VaultProvider>
                <Probe />
            </VaultProvider>,
        )

        expect(screen.getByText("unlocked")).toBeTruthy()
        expect(getDeviceKey).not.toHaveBeenCalled()
    })

    it("falls back to locked if trusted-browser bootstrap hangs", async () => {
        getVaultRuntime.mockReturnValue({
            key: null,
            vaultGeneration: null,
            vaultId: null,
        })
        readCapsule.mockReturnValue({
            version: 2,
            deviceId: "device-1",
            vaultId: "vault-123",
            vaultGeneration: 1,
            wrappedVaultKey: "wrapped-vault-key",
            expiresAt: Date.now() + 60_000,
        })
        getDeviceKey.mockReturnValue(new Promise(() => {}))

        const { VaultProvider, useVault } = await import("@/components/vault/vault-provider")
        function Probe() {
            const { status } = useVault()
            return <div>{status}</div>
        }

        render(
            <VaultProvider>
                <Probe />
            </VaultProvider>,
        )

        expect(screen.getByText("unlocking")).toBeTruthy()

        await act(async () => {
            vi.advanceTimersByTime(5_000)
            await Promise.resolve()
        })

        expect(screen.getByText("locked")).toBeTruthy()
        expect(clearVaultRuntime).toHaveBeenCalled()
    })

    it("auto-locks after prolonged inactivity", async () => {
        getVaultRuntime.mockReturnValue({
            key: {} as CryptoKey,
            vaultGeneration: 3,
            vaultId: "vault-123",
        })

        const { VaultProvider, useVault } = await import("@/components/vault/vault-provider")
        function Probe() {
            const { status } = useVault()
            return <div>{status}</div>
        }

        render(
            <VaultProvider>
                <Probe />
            </VaultProvider>,
        )

        expect(screen.getByText("unlocked")).toBeTruthy()

        await act(async () => {
            vi.advanceTimersByTime(31 * 60 * 1000)
            await Promise.resolve()
        })

        expect(screen.getByText("locked")).toBeTruthy()
        expect(clearVaultRuntime).toHaveBeenCalled()
        expect(broadcastVaultMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: "VAULT_LOCKED",
        }))
    })

    it("unlocks after a sync message from another tab when trusted-browser data is available", async () => {
        getVaultRuntime.mockReturnValue({
            key: null,
            vaultGeneration: null,
            vaultId: null,
        })
        readCapsule.mockReturnValueOnce(null)
        readCapsule.mockReturnValue({
            version: 2,
            deviceId: "device-1",
            vaultId: "vault-123",
            vaultGeneration: 4,
            wrappedVaultKey: "wrapped-vault-key",
            expiresAt: Date.now() + 60_000,
        })
        getDeviceKey.mockResolvedValue({} as CryptoKey)
        readVaultApiData.mockResolvedValue({
            vaultId: "vault-123",
            vaultGeneration: 4,
            hasVault: true,
        })
        unwrapVaultKey.mockResolvedValue({} as CryptoKey)

        const { VaultProvider, useVault } = await import("@/components/vault/vault-provider")
        function Probe() {
            const { status } = useVault()
            return <div>{status}</div>
        }

        render(
            <VaultProvider>
                <Probe />
            </VaultProvider>,
        )

        await act(async () => {
            await Promise.resolve()
        })

        expect(screen.getByText("locked")).toBeTruthy()

        await act(async () => {
            syncCallback?.({
                type: "VAULT_UNLOCKED",
                vaultGeneration: 4,
                vaultId: "vault-123",
                timestamp: Date.now(),
                source: "tab-2",
            })
            await Promise.resolve()
        })

        expect(screen.getByText("unlocked")).toBeTruthy()
        expect(setVaultRuntime).toHaveBeenCalledWith(expect.anything(), 4, "vault-123")
    })

    it("clears stale trusted-browser state and stays locked when no capsule is available", async () => {
        getVaultRuntime.mockReturnValue({
            key: null,
            vaultGeneration: null,
            vaultId: null,
        })
        readCapsule.mockReturnValue(null)

        const { VaultProvider, useVault } = await import("@/components/vault/vault-provider")
        function Probe() {
            const { status } = useVault()
            return <div>{status}</div>
        }

        render(
            <VaultProvider>
                <Probe />
            </VaultProvider>,
        )

        await act(async () => {
            await Promise.resolve()
        })

        expect(screen.getByText("locked")).toBeTruthy()
        expect(getDeviceKey).not.toHaveBeenCalled()
        expect(clearVaultRuntime).toHaveBeenCalled()
    })

    it("re-locks and updates generation when another tab rotates the vault", async () => {
        getVaultRuntime.mockReturnValue({
            key: {} as CryptoKey,
            vaultGeneration: 1,
            vaultId: "vault-123",
        })

        const { VaultProvider, useVault } = await import("@/components/vault/vault-provider")
        function Probe() {
            const { status, vaultGeneration } = useVault()
            return <div>{`${status}:${vaultGeneration ?? "none"}`}</div>
        }

        render(
            <VaultProvider>
                <Probe />
            </VaultProvider>,
        )

        expect(screen.getByText("unlocked:1")).toBeTruthy()

        await act(async () => {
            syncCallback?.({
                type: "VAULT_ROTATED",
                vaultGeneration: 2,
                vaultId: "vault-123",
                timestamp: Date.now(),
                source: "tab-2",
            })
            await Promise.resolve()
        })

        expect(screen.getByText("locked:2")).toBeTruthy()
        expect(clearTrustedBrowserState).toHaveBeenCalled()
        expect(clearVaultRuntime).toHaveBeenCalled()
    })
})
