"use client"

import { readVaultApiData } from "@/lib/vault/client"

interface WrappedDropKeyRecord {
    dropId: string
    wrappedKey: string
    vaultGeneration: number
}

const DROP_KEYS_CACHE_TTL_MS = 5 * 60 * 1000

let wrappedDropKeysCache: {
    records: WrappedDropKeyRecord[]
    expiresAt: number
} | null = null
let wrappedDropKeysInflight: Promise<WrappedDropKeyRecord[]> | null = null

function cacheWrappedDropKeys(records: WrappedDropKeyRecord[]) {
    wrappedDropKeysCache = {
        records,
        expiresAt: Date.now() + DROP_KEYS_CACHE_TTL_MS,
    }
}

function getCachedWrappedDropKeys(): WrappedDropKeyRecord[] | null {
    if (!wrappedDropKeysCache) return null
    if (Date.now() > wrappedDropKeysCache.expiresAt) {
        wrappedDropKeysCache = null
        return null
    }
    return wrappedDropKeysCache.records
}

export async function fetchWrappedDropKeys(): Promise<WrappedDropKeyRecord[]> {
    const cached = getCachedWrappedDropKeys()
    if (cached) {
        return cached
    }

    if (wrappedDropKeysInflight) {
        return wrappedDropKeysInflight
    }

    try {
        wrappedDropKeysInflight = readVaultApiData<WrappedDropKeyRecord[]>("/api/vault/drop-keys")
        const records = await wrappedDropKeysInflight
        cacheWrappedDropKeys(records)
        return records
    } catch {
        return getCachedWrappedDropKeys() ?? []
    } finally {
        wrappedDropKeysInflight = null
    }
}

export async function fetchWrappedDropKey(dropId: string): Promise<WrappedDropKeyRecord | null> {
    const cached = getCachedWrappedDropKeys()
    if (cached) {
        return cached.find((record) => record.dropId === dropId) ?? null
    }

    try {
        return await readVaultApiData<WrappedDropKeyRecord>(`/api/vault/drop-keys?dropId=${encodeURIComponent(dropId)}`)
    } catch {
        return getCachedWrappedDropKeys()?.find((record) => record.dropId === dropId) ?? null
    }
}

export function upsertCachedWrappedDropKey(record: WrappedDropKeyRecord) {
    const current = getCachedWrappedDropKeys() ?? []
    const next = current.filter((entry) => entry.dropId !== record.dropId)
    next.unshift(record)
    cacheWrappedDropKeys(next)
}

export function clearWrappedDropKeysCache() {
    wrappedDropKeysCache = null
    wrappedDropKeysInflight = null
}
