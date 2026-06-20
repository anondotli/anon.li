"use client"

import * as React from "react"
import {
    base64UrlToArrayBuffer,
    derivePasswordKEK,
    unwrapVaultKey,
    unwrapVaultManagedKey,
    wrapVaultManagedKey,
} from "@/lib/vault/crypto"
import { persistTrustedBrowser, readVaultApiData } from "@/lib/vault/client"
import { ensureIdentityKeypair } from "@/lib/vault/identity-keys-client"
import { clearOrgVaultKeyCache, getOrgKeyAccessState, getOrgVaultKey } from "@/lib/vault/org-vault-client"
import { getVaultRuntime, setVaultRuntime, clearVaultRuntime } from "@/lib/vault/runtime"
import { getVaultStorageSupport } from "@/lib/vault/storage-support"
import {
    clearTrustedBrowserState,
    getDeviceKey,
    readCapsule,
} from "@/lib/vault/trusted-browser"
import { broadcastVaultMessage, createVaultTabId, subscribeToVaultSync, type VaultSyncMessage } from "@/lib/vault/sync"
import { authClient } from "@/lib/auth-client"

type VaultStatus = "locked" | "unlocking" | "unlocked" | "error"

const TRUSTED_BROWSER_BOOTSTRAP_TIMEOUT_MS = 5_000
/** setTimeout delays above this overflow its signed 32-bit range and fire immediately. */
const MAX_TIMEOUT_MS = 2_147_483_647

class TimeoutError extends Error {
    constructor(message: string) {
        super(message)
        this.name = "TimeoutError"
    }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = window.setTimeout(() => {
            reject(new TimeoutError(message))
        }, timeoutMs)

        promise.then(
            (value) => {
                window.clearTimeout(timer)
                resolve(value)
            },
            (error) => {
                window.clearTimeout(timer)
                reject(error)
            },
        )
    })
}

interface UnlockOptions {
    trustBrowser?: boolean
}

interface VaultContextValue {
    status: VaultStatus
    error: string | null
    vaultGeneration: number | null
    vaultId: string | null
    unlockWithPassword: (password: string, options?: UnlockOptions) => Promise<void>
    lock: () => void
    wrapDropKey: (rawKey: ArrayBuffer) => Promise<string>
    unwrapDropKey: (wrappedKey: string) => Promise<CryptoKey>
    /**
     * Wrap a resource key to a team's shared org vault key (org shared-E2EE), so
     * every granted member can open it. Returns the wrapped key + the org key
     * generation it was wrapped with. Throws if the caller isn't granted yet.
     */
    wrapDropKeyForOrg: (rawKey: ArrayBuffer, organizationId: string) => Promise<{ wrappedKey: string; orgKeyGeneration: number }>
    /** Unwrap a key that was wrapped to a team's org vault key (Drop). */
    unwrapOrgManagedKey: (wrappedKey: string, organizationId: string) => Promise<CryptoKey>
    /**
     * Recover the raw org vault key handle for a team (or null if the caller
     * isn't granted yet). Used for Form owner keys, which wrap an arbitrary
     * payload (the form private key) with wrapVaultPayload rather than AES-KW.
     */
    getOrgVaultKeyHandle: (organizationId: string) => Promise<{ key: CryptoKey; generation: number } | null>
    getVaultKey: () => CryptoKey | null
}

const VaultContext = React.createContext<VaultContextValue | null>(null)

export function VaultProvider({
    children,
}: {
    children: React.ReactNode
}) {
    return <EnabledVaultProvider>{children}</EnabledVaultProvider>
}

function EnabledVaultProvider({ children }: { children: React.ReactNode }) {
    const [status, setStatus] = React.useState<VaultStatus>(() => {
        const runtime = getVaultRuntime()
        return runtime.key && runtime.vaultGeneration && runtime.vaultId ? "unlocked" : "unlocking"
    })
    const [error, setError] = React.useState<string | null>(null)
    const [vaultGeneration, setVaultGeneration] = React.useState<number | null>(() => getVaultRuntime().vaultGeneration)
    const [vaultId, setVaultId] = React.useState<string | null>(() => getVaultRuntime().vaultId)
    const [tabId] = React.useState(createVaultTabId)
    const statusRef = React.useRef(status)
    const lockRef = React.useRef(() => {})

    // Live login session — its expiry drives the vault auto-lock below.
    const { data: sessionData } = authClient.useSession()
    const sessionExpiresAtMs = React.useMemo(() => {
        const raw = sessionData?.session?.expiresAt
        if (!raw) return null
        const ms = new Date(raw).getTime()
        return Number.isNaN(ms) ? null : ms
    }, [sessionData?.session?.expiresAt])

    React.useEffect(() => {
        statusRef.current = status
    }, [status])

    const finishUnlock = React.useCallback(async (vaultKey: CryptoKey, nextVaultGeneration: number, nextVaultId: string, options?: UnlockOptions) => {
        setVaultRuntime(vaultKey, nextVaultGeneration, nextVaultId)
        setVaultGeneration(nextVaultGeneration)
        setVaultId(nextVaultId)
        setStatus("unlocked")
        setError(null)

        if (options?.trustBrowser && getVaultStorageSupport().trustedBrowser) {
            try {
                await persistTrustedBrowser(vaultKey, nextVaultGeneration, nextVaultId)
            } catch {
                // Unlock should still succeed even if local browser trust persistence fails.
            }
        }

        try {
            broadcastVaultMessage({
                type: "VAULT_UNLOCKED",
                vaultGeneration: nextVaultGeneration,
                vaultId: nextVaultId,
                timestamp: Date.now(),
                source: tabId,
            })
        } catch {
            // Unlock should not fail if cross-tab sync is unavailable.
        }

        // Best-effort: ensure the org shared-E2EE identity keypair exists for
        // this generation (ORG-E2EE-DESIGN.md §9). Fire-and-forget + fail-open —
        // an async call can't throw synchronously here, and the .catch swallows
        // any rejection, so this can never block or delay unlock. Harmless no-op
        // for the B2C majority (just populates an otherwise-unused keypair).
        void ensureIdentityKeypair(vaultKey, nextVaultGeneration, nextVaultId).catch(() => {})
    }, [tabId])

    const setLockedState = React.useCallback(() => {
        clearVaultRuntime()
        clearOrgVaultKeyCache()
        setVaultGeneration(null)
        setVaultId(null)
        setStatus("locked")
        setError(null)
    }, [])

    const attemptTrustedBrowserUnlock = React.useCallback(async () => {
        const runtime = getVaultRuntime()
        if (runtime.key && runtime.vaultGeneration && runtime.vaultId) {
            await Promise.resolve()
            setVaultGeneration(runtime.vaultGeneration)
            setVaultId(runtime.vaultId)
            setStatus("unlocked")
            setError(null)
            return true
        }

        const support = getVaultStorageSupport()
        if (!support.vault) {
            await Promise.resolve()
            setStatus("error")
            setError("This browser does not support the secure vault requirements.")
            return false
        }

        if (!support.trustedBrowser) {
            await Promise.resolve()
            setStatus("locked")
            setError(null)
            return false
        }

        const capsule = readCapsule()
        if (!capsule) {
            await Promise.resolve()
            setLockedState()
            return false
        }

        let deviceKeyPromise: Promise<CryptoKey | null>
        try {
            deviceKeyPromise = withTimeout(
                getDeviceKey(),
                TRUSTED_BROWSER_BOOTSTRAP_TIMEOUT_MS,
                "Trusted browser unlock timed out",
            )
        } catch {
            await Promise.resolve()
            setLockedState()
            return false
        }

        await Promise.resolve()
        setStatus("unlocking")
        setError(null)

        let deviceKey: CryptoKey | null
        try {
            deviceKey = await deviceKeyPromise
        } catch {
            setLockedState()
            return false
        }

        if (!deviceKey) {
            await clearTrustedBrowserState()
            setLockedState()
            return false
        }

        try {
            const status = await withTimeout(
                readVaultApiData<{
                    vaultId: string | null
                    vaultGeneration: number | null
                    hasVault: boolean
                }>("/api/vault/migration-status"),
                TRUSTED_BROWSER_BOOTSTRAP_TIMEOUT_MS,
                "Trusted browser validation timed out",
            )

            if (!status.hasVault || status.vaultId !== capsule.vaultId || status.vaultGeneration !== capsule.vaultGeneration) {
                await clearTrustedBrowserState()
                setLockedState()
                return false
            }

            const vaultKey = await withTimeout(
                unwrapVaultKey(base64UrlToArrayBuffer(capsule.wrappedVaultKey), deviceKey),
                TRUSTED_BROWSER_BOOTSTRAP_TIMEOUT_MS,
                "Trusted browser unlock timed out",
            )
            await finishUnlock(vaultKey, capsule.vaultGeneration, capsule.vaultId)
            return true
        } catch {
            await clearTrustedBrowserState()
            setLockedState()
            return false
        }
    }, [finishUnlock, setLockedState])

    React.useEffect(() => {
        if (statusRef.current !== "unlocked") {
            void attemptTrustedBrowserUnlock()
        }
    }, [attemptTrustedBrowserUnlock])

    React.useEffect(() => {
        const onPageShow = () => {
            if (statusRef.current !== "unlocked") {
                void attemptTrustedBrowserUnlock()
            }
        }

        window.addEventListener("pageshow", onPageShow)

        return () => {
            window.removeEventListener("pageshow", onPageShow)
        }
    }, [attemptTrustedBrowserUnlock])

    // After 2FA redirect, local browser trust auto-unlock (attemptTrustedBrowserUnlock)
    // handles re-opening the vault. If local trust is unavailable, the user
    // enters their password in the unlock prompt. We no longer stash the
    // plaintext password in sessionStorage.

    React.useEffect(() => {
        return subscribeToVaultSync((message: VaultSyncMessage) => {
            if (message.source === tabId) return

            if (message.type === "VAULT_UNLOCKED" && statusRef.current !== "unlocked") {
                void attemptTrustedBrowserUnlock()
                return
            }

            if (message.type === "VAULT_ROTATED") {
                void clearTrustedBrowserState()
                clearVaultRuntime()
                clearOrgVaultKeyCache()
                setVaultGeneration(message.vaultGeneration)
                setVaultId(message.vaultId)
                setStatus("locked")
                setError(null)
                return
            }

            if (message.type === "VAULT_ORG_ROTATED") {
                // Another tab rotated a team key; drop our cached org vault key for
                // that org so the next read fetches the new grant/generation.
                clearOrgVaultKeyCache(message.organizationId)
                return
            }

            if (message.type === "SIGN_OUT") {
                clearVaultRuntime()
                setVaultGeneration(null)
                setVaultId(null)
                setStatus("locked")
                setError(null)
                // The originating tab has revoked the session server-side; the
                // session cookie in this tab is no longer valid. Hard-navigate
                // to /login so the receiver doesn't sit on an authed-looking page
                // with a locked vault until the next server roundtrip.
                window.location.href = "/login"
                return
            }

            if (message.type === "VAULT_LOCKED") {
                clearVaultRuntime()
                setVaultGeneration(null)
                setVaultId(null)
                setStatus("locked")
                setError(null)
            }
        })
    }, [attemptTrustedBrowserUnlock, tabId])

    // Auto-lock when the login session expires.
    //
    // The vault previously auto-locked after a fixed idle window. Per product
    // decision it now stays unlocked for the life of the login session and
    // locks only once that session expires (alongside the existing explicit
    // lock / sign-out / rotation paths). Expiry is re-read from the live
    // session on every render, so a server-side session refresh (sliding
    // expiry) pushes the auto-lock time out with it.

    React.useEffect(() => {
        if (status !== "unlocked") return
        if (sessionExpiresAtMs == null) return

        const maybeLock = () => {
            if (statusRef.current !== "unlocked") return
            if (Date.now() >= sessionExpiresAtMs) {
                lockRef.current()
            }
        }

        // The session may already be expired when restoring from a trusted
        // browser, so check immediately as well as on a schedule.
        maybeLock()

        // Fire precisely at expiry; the slow interval is a safety net in case
        // the exact timer is throttled or the tab was suspended past expiry.
        const remaining = Math.min(Math.max(0, sessionExpiresAtMs - Date.now()), MAX_TIMEOUT_MS)
        const expiryTimer = window.setTimeout(maybeLock, remaining)
        const interval = window.setInterval(maybeLock, 60_000)

        return () => {
            window.clearTimeout(expiryTimer)
            window.clearInterval(interval)
        }
    }, [status, sessionExpiresAtMs])

    const unlockWithPassword = React.useCallback(async (password: string, options?: UnlockOptions) => {
        setStatus("unlocking")
        setError(null)

        try {
            const materials = await readVaultApiData<{
                vaultSalt: string
                passwordWrappedVaultKey: string
                vaultGeneration: number
                vaultId: string
            }>("/api/vault/unlock")

            const wrappedVaultKey = base64UrlToArrayBuffer(materials.passwordWrappedVaultKey)
            const passwordKey = await derivePasswordKEK(password, materials.vaultSalt)

            let vaultKey: CryptoKey
            try {
                vaultKey = await unwrapVaultKey(wrappedVaultKey, passwordKey)
            } catch {
                throw new Error("Incorrect password")
            }

            await finishUnlock(vaultKey, materials.vaultGeneration, materials.vaultId, options)
        } catch (unlockError) {
            clearVaultRuntime()
            setVaultGeneration(null)
            setVaultId(null)
            setStatus("error")
            // Only surface the known "Incorrect password" message to the UI.
            // Any other error (network, API, key-import) gets a generic label
            // so we never leak server-side detail or sensitive metadata.
            const message = unlockError instanceof Error && unlockError.message === "Incorrect password"
                ? "Incorrect password"
                : "Vault unlock failed. Please try again."
            setError(message)
            throw unlockError
        }
    }, [finishUnlock])

    const lock = React.useCallback(() => {
        setLockedState()
        broadcastVaultMessage({
            type: "VAULT_LOCKED",
            timestamp: Date.now(),
            source: tabId,
        })
    }, [setLockedState, tabId])

    React.useEffect(() => {
        lockRef.current = lock
    }, [lock])

    const wrapDropKey = React.useCallback(async (rawKey: ArrayBuffer) => {
        const vaultKey = getVaultRuntime().key
        if (!vaultKey) {
            throw new Error("Vault is locked")
        }

        return wrapVaultManagedKey(rawKey, vaultKey)
    }, [])

    const unwrapDropKey = React.useCallback(async (wrappedKey: string) => {
        const vaultKey = getVaultRuntime().key
        if (!vaultKey) {
            throw new Error("Vault is locked")
        }

        return unwrapVaultManagedKey(wrappedKey, vaultKey)
    }, [])

    const wrapDropKeyForOrg = React.useCallback(async (rawKey: ArrayBuffer, organizationId: string) => {
        const vaultKey = getVaultRuntime().key
        if (!vaultKey) {
            throw new Error("Vault is locked")
        }
        const handle = await getOrgVaultKey(organizationId, vaultKey)
        if (!handle) {
            const state = await getOrgKeyAccessState(organizationId, vaultKey)
            throw new Error(
                state === "no-identity"
                    ? "Your encryption identity isn't set up yet. Unlock your vault and try again in a moment."
                    : "You don't have access to this team's encryption key yet. Ask a team admin to grant access.",
            )
        }
        return { wrappedKey: await wrapVaultManagedKey(rawKey, handle.key), orgKeyGeneration: handle.generation }
    }, [])

    const unwrapOrgManagedKey = React.useCallback(async (wrappedKey: string, organizationId: string) => {
        const vaultKey = getVaultRuntime().key
        if (!vaultKey) {
            throw new Error("Vault is locked")
        }
        const handle = await getOrgVaultKey(organizationId, vaultKey)
        if (!handle) {
            throw new Error("You don't have access to this team's encryption key yet. Ask a team admin to grant access.")
        }
        return unwrapVaultManagedKey(wrappedKey, handle.key)
    }, [])

    const getOrgVaultKeyHandle = React.useCallback(async (organizationId: string) => {
        const vaultKey = getVaultRuntime().key
        if (!vaultKey) {
            throw new Error("Vault is locked")
        }
        return getOrgVaultKey(organizationId, vaultKey)
    }, [])

    const value = React.useMemo<VaultContextValue>(() => ({
        status,
        error,
        vaultGeneration,
        vaultId,
        unlockWithPassword,
        lock,
        wrapDropKey,
        unwrapDropKey,
        wrapDropKeyForOrg,
        unwrapOrgManagedKey,
        getOrgVaultKeyHandle,
        getVaultKey: () => getVaultRuntime().key,
    }), [error, lock, status, unlockWithPassword, unwrapDropKey, vaultGeneration, vaultId, wrapDropKey, wrapDropKeyForOrg, unwrapOrgManagedKey, getOrgVaultKeyHandle])

    return (
        <VaultContext.Provider value={value}>
            {children}
        </VaultContext.Provider>
    )
}

export function useVault() {
    const context = React.useContext(VaultContext)
    if (!context) {
        throw new Error("useVault must be used within a VaultProvider")
    }
    return context
}

export function useOptionalVault() {
    return React.useContext(VaultContext)
}
