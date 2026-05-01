"use client"

import { readVaultApiData } from "@/lib/vault/client"

interface WrappedFormKeyRecord {
    formId: string
    wrappedKey: string
    vaultGeneration: number
}

const FORM_KEYS_CACHE_TTL_MS = 5 * 60 * 1000

let wrappedFormKeysCache: {
    records: WrappedFormKeyRecord[]
    expiresAt: number
} | null = null
let wrappedFormKeysInflight: Promise<WrappedFormKeyRecord[]> | null = null

function cacheWrappedFormKeys(records: WrappedFormKeyRecord[]) {
    wrappedFormKeysCache = {
        records,
        expiresAt: Date.now() + FORM_KEYS_CACHE_TTL_MS,
    }
}

function getCachedWrappedFormKeys(): WrappedFormKeyRecord[] | null {
    if (!wrappedFormKeysCache) return null
    if (Date.now() > wrappedFormKeysCache.expiresAt) {
        wrappedFormKeysCache = null
        return null
    }
    return wrappedFormKeysCache.records
}

export async function fetchWrappedFormKeys(): Promise<WrappedFormKeyRecord[]> {
    const cached = getCachedWrappedFormKeys()
    if (cached) {
        return cached
    }

    if (wrappedFormKeysInflight) {
        return wrappedFormKeysInflight
    }

    try {
        wrappedFormKeysInflight = readVaultApiData<WrappedFormKeyRecord[]>("/api/vault/form-keys")
        const records = await wrappedFormKeysInflight
        cacheWrappedFormKeys(records)
        return records
    } catch {
        return getCachedWrappedFormKeys() ?? []
    } finally {
        wrappedFormKeysInflight = null
    }
}

export async function fetchWrappedFormKey(formId: string): Promise<WrappedFormKeyRecord | null> {
    const cached = getCachedWrappedFormKeys()
    if (cached) {
        return cached.find((record) => record.formId === formId) ?? null
    }

    try {
        return await readVaultApiData<WrappedFormKeyRecord>(`/api/vault/form-keys?formId=${encodeURIComponent(formId)}`)
    } catch {
        return getCachedWrappedFormKeys()?.find((record) => record.formId === formId) ?? null
    }
}

export function upsertCachedWrappedFormKey(record: WrappedFormKeyRecord) {
    const current = getCachedWrappedFormKeys() ?? []
    const next = current.filter((entry) => entry.formId !== record.formId)
    next.unshift(record)
    cacheWrappedFormKeys(next)
}

export function clearWrappedFormKeysCache() {
    wrappedFormKeysCache = null
    wrappedFormKeysInflight = null
}
