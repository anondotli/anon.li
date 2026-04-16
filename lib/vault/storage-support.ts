"use client"

export interface VaultStorageSupport {
    cryptoSubtle: boolean
    indexedDb: boolean
    localStorage: boolean
    trustedBrowser: boolean
    vault: boolean
}

function isCryptoSubtleAvailable() {
    return typeof window !== "undefined" && typeof window.crypto !== "undefined" && typeof window.crypto.subtle !== "undefined"
}

function isLocalStorageAvailable() {
    if (typeof window === "undefined") return false

    try {
        const key = "__anon_vault_probe__"
        window.localStorage.setItem(key, "1")
        window.localStorage.removeItem(key)
        return true
    } catch {
        return false
    }
}

function isIndexedDbAvailable() {
    return typeof window !== "undefined" && typeof window.indexedDB !== "undefined"
}

export function getVaultStorageSupport(): VaultStorageSupport {
    const cryptoSubtle = isCryptoSubtleAvailable()
    const indexedDb = isIndexedDbAvailable()
    const localStorage = isLocalStorageAvailable()

    return {
        cryptoSubtle,
        indexedDb,
        localStorage,
        trustedBrowser: cryptoSubtle && indexedDb && localStorage,
        vault: cryptoSubtle,
    }
}
