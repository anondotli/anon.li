"use client"

import { readVaultApiData } from "@/lib/vault/client"
import { parseVaultData, WrappedFormKeyRecordSchema } from "@/lib/vault/client-schemas"

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
        return await readVaultApiData(
            `/api/vault/form-keys?formId=${encodeURIComponent(formId)}`,
            undefined,
            parseVaultData(WrappedFormKeyRecordSchema),
        )
    } catch {
        return null
    }
}
