"use client"

import posthog from "posthog-js"
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

/**
 * Forget this browser's vault trust (capsule + device key) and tell other tabs
 * to lock and leave. For flows where the server session is already gone (e.g.
 * account deletion) and `authClient.signOut` would have nothing to revoke.
 */
export function clearVaultForSignOut(source: string): Promise<void> {
    const cleared = clearTrustedBrowserState().catch(() => {
        // Best effort cleanup before sign-out.
    })

    try {
        broadcastVaultMessage({
            type: "SIGN_OUT",
            timestamp: Date.now(),
            source,
        })
    } catch {
        // Cross-tab sync unavailable; other tabs lock on their next request.
    }

    // Sign-out navigates with a full page load, so PostHogIdentify never sees
    // the userId → null transition. Reset here so the next person on this
    // browser is not attributed to the previous user's identified profile.
    if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
        try {
            posthog.reset()
        } catch {
            // Analytics must never block sign-out.
        }
    }
    return cleared
}

export function signOutWithVaultCleanup(source: string, redirectTo = "/") {
    void clearVaultForSignOut(source)
    authClient.signOut({ fetchOptions: { onSuccess: () => { window.location.replace(redirectTo) } } })
}
