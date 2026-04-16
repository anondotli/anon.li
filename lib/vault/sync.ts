"use client"

import {
    VAULT_CAPSULE_STORAGE_KEY,
    VAULT_SIGNAL_STORAGE_KEY,
    readCapsule,
} from "@/lib/vault/trusted-browser"
import { getVaultStorageSupport } from "@/lib/vault/storage-support"

const CHANNEL_NAME = "anon-vault"

const VAULT_SYNC_TYPES = ["VAULT_UNLOCKED", "VAULT_LOCKED", "VAULT_ROTATED", "SIGN_OUT"] as const
type VaultSyncType = typeof VAULT_SYNC_TYPES[number]

export type VaultSyncMessage =
    | { type: "VAULT_UNLOCKED"; vaultGeneration: number; vaultId: string; timestamp: number; source: string }
    | { type: "VAULT_LOCKED"; timestamp: number; source: string }
    | { type: "VAULT_ROTATED"; vaultGeneration: number; vaultId: string; timestamp: number; source: string }
    | { type: "SIGN_OUT"; timestamp: number; source: string }

export function createVaultTabId() {
    return crypto.randomUUID()
}

function safelyWriteStorageSignal(message: VaultSyncMessage) {
    if (!getVaultStorageSupport().localStorage) return

    try {
        window.localStorage.setItem(VAULT_SIGNAL_STORAGE_KEY, JSON.stringify(message))
        window.localStorage.removeItem(VAULT_SIGNAL_STORAGE_KEY)
    } catch {
        // Best effort fallback only.
    }
}

export function broadcastVaultMessage(message: VaultSyncMessage) {
    if (typeof window === "undefined") return

    if ("BroadcastChannel" in window) {
        const channel = new BroadcastChannel(CHANNEL_NAME)
        channel.postMessage(message)
        channel.close()
    }

    safelyWriteStorageSignal(message)
}

function isVaultSyncType(value: unknown): value is VaultSyncType {
    return typeof value === "string" && (VAULT_SYNC_TYPES as readonly string[]).includes(value)
}

function parseVaultSyncMessage(value: string | null): VaultSyncMessage | null {
    if (!value) return null

    try {
        const parsed = JSON.parse(value) as Partial<VaultSyncMessage> & Record<string, unknown>
        if (
            !parsed
            || typeof parsed !== "object"
            || !isVaultSyncType(parsed.type)
            || typeof parsed.timestamp !== "number"
            || typeof parsed.source !== "string"
        ) {
            return null
        }

        if (parsed.type === "VAULT_UNLOCKED" || parsed.type === "VAULT_ROTATED") {
            if (typeof parsed.vaultGeneration !== "number" || typeof parsed.vaultId !== "string") {
                return null
            }
        }

        return parsed as VaultSyncMessage
    } catch {
        return null
    }
}

export function subscribeToVaultSync(onMessage: (message: VaultSyncMessage) => void) {
    let channel: BroadcastChannel | null = null

    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
        channel = new BroadcastChannel(CHANNEL_NAME)
        channel.onmessage = (event) => {
            const message = parseVaultSyncMessage(
                typeof event.data === "string" ? event.data : JSON.stringify(event.data ?? null),
            )
            if (message) onMessage(message)
        }
    }

    const handleStorage = (event: StorageEvent) => {
        if (event.key === VAULT_SIGNAL_STORAGE_KEY) {
            const message = parseVaultSyncMessage(event.newValue)
            if (message) {
                onMessage(message)
            }
            return
        }

        if (event.key === VAULT_CAPSULE_STORAGE_KEY) {
            const capsule = readCapsule()
            if (capsule) {
                onMessage({
                    type: "VAULT_UNLOCKED",
                    vaultGeneration: capsule.vaultGeneration,
                    vaultId: capsule.vaultId,
                    timestamp: Date.now(),
                    source: "storage",
                })
            } else {
                onMessage({
                    type: "VAULT_LOCKED",
                    timestamp: Date.now(),
                    source: "storage",
                })
            }
        }
    }

    window.addEventListener("storage", handleStorage)

    return () => {
        window.removeEventListener("storage", handleStorage)
        channel?.close()
    }
}
