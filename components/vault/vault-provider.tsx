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
import { getVaultRuntime, setVaultRuntime, clearVaultRuntime } from "@/lib/vault/runtime"
import { getVaultStorageSupport } from "@/lib/vault/storage-support"
import {
    clearTrustedBrowserState,
    getDeviceKey,
    readCapsule,
} from "@/lib/vault/trusted-browser"
import { broadcastVaultMessage, createVaultTabId, subscribeToVaultSync, type VaultSyncMessage } from "@/lib/vault/sync"

type VaultStatus = "locked" | "unlocking" | "unlocked" | "error"

/** Auto-lock after 30 minutes of inactivity */
const AUTO_LOCK_TIMEOUT_MS = 30 * 60 * 1000
const TRUSTED_BROWSER_BOOTSTRAP_TIMEOUT_MS = 5_000

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
    getVaultKey: () => CryptoKey | null
}

const VaultContext = React.createContext<VaultContextValue | null>(null)

export function VaultProvider({
    children,
    enabled = true,
}: {
    children: React.ReactNode
    enabled?: boolean
}) {
    const disabledValue = React.useMemo<VaultContextValue>(() => ({
        status: "unlocked",
        error: null,
        vaultGeneration: null,
        vaultId: null,
        unlockWithPassword: async () => {
            throw new Error("Vault features are unavailable until the database migration is applied.")
        },
        lock: () => {},
        wrapDropKey: async () => {
            throw new Error("Vault features are unavailable until the database migration is applied.")
        },
        unwrapDropKey: async () => {
            throw new Error("Vault features are unavailable until the database migration is applied.")
        },
        getVaultKey: () => null,
    }), [])

    if (!enabled) {
        return <VaultContext.Provider value={disabledValue}>{children}</VaultContext.Provider>
    }

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
    statusRef.current = status
    const lastActivityRef = React.useRef(Date.now())
    const lockRef = React.useRef(() => {})

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
    }, [tabId])

    const setLockedState = React.useCallback(() => {
        clearVaultRuntime()
        setVaultGeneration(null)
        setVaultId(null)
        setStatus("locked")
        setError(null)
    }, [])

    const attemptTrustedBrowserUnlock = React.useCallback(async () => {
        const runtime = getVaultRuntime()
        if (runtime.key && runtime.vaultGeneration && runtime.vaultId) {
            setVaultGeneration(runtime.vaultGeneration)
            setVaultId(runtime.vaultId)
            setStatus("unlocked")
            setError(null)
            return true
        }

        const support = getVaultStorageSupport()
        if (!support.vault) {
            setStatus("error")
            setError("This browser does not support the secure vault requirements.")
            return false
        }

        if (!support.trustedBrowser) {
            setStatus("locked")
            setError(null)
            return false
        }

        const capsule = readCapsule()
        if (!capsule) {
            setLockedState()
            return false
        }

        setStatus("unlocking")
        setError(null)

        let deviceKey: CryptoKey | null
        try {
            deviceKey = await withTimeout(
                getDeviceKey(),
                TRUSTED_BROWSER_BOOTSTRAP_TIMEOUT_MS,
                "Trusted browser unlock timed out",
            )
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
        void attemptTrustedBrowserUnlock()
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
                setVaultGeneration(message.vaultGeneration)
                setVaultId(message.vaultId)
                setStatus("locked")
                setError(null)
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

    // Auto-lock after inactivity

    React.useEffect(() => {
        if (status !== "unlocked") return

        lastActivityRef.current = Date.now()

        const onActivity = () => {
            lastActivityRef.current = Date.now()
        }

        const activityEvents = ["keydown", "mousemove", "scroll", "touchstart", "click"] as const
        for (const event of activityEvents) {
            window.addEventListener(event, onActivity, { passive: true })
        }

        const interval = window.setInterval(() => {
            if (statusRef.current !== "unlocked") return
            if (Date.now() - lastActivityRef.current >= AUTO_LOCK_TIMEOUT_MS) {
                lockRef.current()
            }
        }, 60_000)

        const onVisibilityChange = () => {
            if (document.visibilityState !== "hidden") return
            if (statusRef.current !== "unlocked") return

            // When the tab becomes hidden, schedule a lock check.
            // If the tab is still hidden after the timeout, lock on next visibility change.
            const hiddenAt = Date.now()
            const checkOnVisible = () => {
                if (document.visibilityState === "visible") {
                    document.removeEventListener("visibilitychange", checkOnVisible)
                    if (Date.now() - hiddenAt >= AUTO_LOCK_TIMEOUT_MS) {
                        lockRef.current()
                    }
                }
            }
            document.addEventListener("visibilitychange", checkOnVisible)
        }
        document.addEventListener("visibilitychange", onVisibilityChange)

        return () => {
            for (const event of activityEvents) {
                window.removeEventListener(event, onActivity)
            }
            window.clearInterval(interval)
            document.removeEventListener("visibilitychange", onVisibilityChange)
        }
    }, [status])

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

    const value = React.useMemo<VaultContextValue>(() => ({
        status,
        error,
        vaultGeneration,
        vaultId,
        unlockWithPassword,
        lock,
        wrapDropKey,
        unwrapDropKey,
        getVaultKey: () => getVaultRuntime().key,
    }), [error, lock, status, unlockWithPassword, unwrapDropKey, vaultGeneration, vaultId, wrapDropKey])

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
