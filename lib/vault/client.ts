"use client"

import { authClient } from "@/lib/auth-client"
import {
    arrayBufferToBase64Url,
    generateDeviceWrappingKey,
    wrapVaultKey,
} from "@/lib/vault/crypto"
import {
    clearTrustedBrowserState,
    getDeviceKey,
    readCapsule,
    storeCapsule,
    storeDeviceKey,
} from "@/lib/vault/trusted-browser"
import { broadcastVaultMessage } from "@/lib/vault/sync"

const LOCAL_TRUST_TTL_MS = 30 * 24 * 60 * 60 * 1000

export class VaultApiError extends Error {
    readonly code: string

    constructor(message: string, code: string) {
        super(message)
        this.name = "VaultApiError"
        this.code = code
    }
}

export async function readVaultApiData<T>(
    input: string,
    init?: RequestInit,
    parse?: (value: unknown) => T,
): Promise<T> {
    const headers = new Headers(init?.headers)
    if (init?.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json")
    }

    const response = await fetch(input, {
        ...init,
        credentials: "include",
        headers,
    })

    const payload: unknown = await response.json().catch(() => null)

    if (!response.ok) {
        const error = payload && typeof payload === "object" && "error" in payload
            ? (payload as { error?: unknown }).error
            : null
        const errorRecord = error && typeof error === "object" ? error as Record<string, unknown> : null
        throw new VaultApiError(
            typeof errorRecord?.message === "string" ? errorRecord.message : "Request failed",
            typeof errorRecord?.code === "string" ? errorRecord.code : "UNKNOWN",
        )
    }

    if (!payload || typeof payload !== "object" || !("data" in payload)) {
        throw new VaultApiError("Vault API returned an invalid response", "INVALID_RESPONSE")
    }
    const data = (payload as { data?: unknown }).data
    return parse ? parse(data) : data as T
}

export async function persistTrustedBrowser(vaultKey: CryptoKey, vaultGeneration: number, vaultId: string) {
    const existingCapsule = readCapsule()
    const deviceId = existingCapsule?.deviceId ?? crypto.randomUUID()
    let deviceKey = await getDeviceKey()

    if (!deviceKey) {
        deviceKey = await generateDeviceWrappingKey()
        await storeDeviceKey(deviceKey)
    }

    const wrappedVaultKey = arrayBufferToBase64Url(await wrapVaultKey(vaultKey, deviceKey))

    storeCapsule({
        version: 2,
        deviceId,
        vaultId,
        vaultGeneration,
        wrappedVaultKey,
        expiresAt: Date.now() + LOCAL_TRUST_TTL_MS,
    })
}

export function signOutWithVaultCleanup(source: string) {
    void clearTrustedBrowserState().catch(() => {
        // Best effort cleanup before sign-out.
    })

    broadcastVaultMessage({
        type: "SIGN_OUT",
        timestamp: Date.now(),
        source,
    })
    authClient.signOut({ fetchOptions: { onSuccess: () => { window.location.href = "/" } } })
}
