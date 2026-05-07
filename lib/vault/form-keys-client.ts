"use client"

import { readVaultApiData } from "@/lib/vault/client"

interface WrappedFormKeyRecord {
    formId: string
    wrappedKey: string
    vaultGeneration: number
}

export async function fetchWrappedFormKey(formId: string): Promise<WrappedFormKeyRecord | null> {
    try {
        return await readVaultApiData<WrappedFormKeyRecord>(`/api/vault/form-keys?formId=${encodeURIComponent(formId)}`)
    } catch {
        return null
    }
}
