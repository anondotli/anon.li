"use client"

import { getVaultStorageSupport } from "@/lib/vault/storage-support"

const DATABASE_NAME = "anon-vault"
const STORE_NAME = "device-keys"
const DEVICE_KEY_ID = "current"

export const VAULT_CAPSULE_STORAGE_KEY = "anon-vault-capsule"
export const VAULT_SIGNAL_STORAGE_KEY = "anon-vault-signal"

interface VaultCapsule {
    version: 2
    deviceId: string
    vaultId: string
    vaultGeneration: number
    wrappedVaultKey: string
    expiresAt: number
}

function isVaultCapsule(value: unknown): value is VaultCapsule {
    return Boolean(
        value
        && typeof value === "object"
        && (value as VaultCapsule).version === 2
        && typeof (value as VaultCapsule).deviceId === "string"
        && typeof (value as VaultCapsule).vaultId === "string"
        && typeof (value as VaultCapsule).vaultGeneration === "number"
        && typeof (value as VaultCapsule).wrappedVaultKey === "string"
        && typeof (value as VaultCapsule).expiresAt === "number"
    )
}

function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE_NAME, 1)

        request.onupgradeneeded = () => {
            const database = request.result
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                database.createObjectStore(STORE_NAME)
            }
        }

        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"))
    })
}

async function withStore<T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
    const database = await openDatabase()
    try {
        return await new Promise<T>((resolve, reject) => {
            const transaction = database.transaction(STORE_NAME, mode)
            const store = transaction.objectStore(STORE_NAME)
            const request = operation(store)

            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"))
            transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"))
        })
    } finally {
        database.close()
    }
}

export async function storeDeviceKey(key: CryptoKey): Promise<void> {
    if (!getVaultStorageSupport().indexedDb) return

    try {
        await navigator.storage?.persist?.()
    } catch {
        // Best effort only.
    }

    await withStore("readwrite", (store) => store.put(key, DEVICE_KEY_ID))
}

export async function getDeviceKey(): Promise<CryptoKey | null> {
    if (!getVaultStorageSupport().indexedDb) return null

    try {
        return await withStore("readonly", (store) => store.get(DEVICE_KEY_ID)) ?? null
    } catch {
        return null
    }
}

async function deleteDeviceKey(): Promise<void> {
    if (!getVaultStorageSupport().indexedDb) return

    try {
        await withStore("readwrite", (store) => store.delete(DEVICE_KEY_ID))
    } catch {
        // Best effort cleanup.
    }
}

export function storeCapsule(capsule: VaultCapsule): void {
    if (!getVaultStorageSupport().localStorage) return
    window.localStorage.setItem(VAULT_CAPSULE_STORAGE_KEY, JSON.stringify(capsule))
}

export function readCapsule(): VaultCapsule | null {
    if (!getVaultStorageSupport().localStorage) return null

    try {
        const raw = window.localStorage.getItem(VAULT_CAPSULE_STORAGE_KEY)
        if (!raw) return null

        const parsed = JSON.parse(raw) as unknown
        if (!isVaultCapsule(parsed)) {
            deleteCapsule()
            return null
        }

        if (parsed.expiresAt <= Date.now()) {
            deleteCapsule()
            return null
        }

        return parsed
    } catch {
        deleteCapsule()
        return null
    }
}

function deleteCapsule(): void {
    if (!getVaultStorageSupport().localStorage) return
    window.localStorage.removeItem(VAULT_CAPSULE_STORAGE_KEY)
}

export async function clearTrustedBrowserState() {
    deleteCapsule()
    await deleteDeviceKey()
}
