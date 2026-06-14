"use client"

import { readVaultApiData } from "@/lib/vault/client"

interface WrappedFormKeyRecord {
    formId: string
    wrappedKey: string
    vaultGeneration: number
    // Set when the form is org-owned: the wrappedKey is wrapped to the team's
    // org vault key and must be unwrapped with it, not the personal vault key.
    organizationId?: string | null
    orgKeyGeneration?: number | null
}

export async function fetchWrappedFormKey(formId: string): Promise<WrappedFormKeyRecord | null> {
    try {
        return await readVaultApiData<WrappedFormKeyRecord>(`/api/vault/form-keys?formId=${encodeURIComponent(formId)}`)
    } catch {
        return null
    }
}
