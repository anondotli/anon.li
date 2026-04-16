"use client"

import "client-only"

interface VaultRuntimeState {
    key: CryptoKey | null
    vaultGeneration: number | null
    vaultId: string | null
}

const state: VaultRuntimeState = {
    key: null,
    vaultGeneration: null,
    vaultId: null,
}

export function getVaultRuntime(): VaultRuntimeState {
    return state
}

export function setVaultRuntime(key: CryptoKey, vaultGeneration: number, vaultId: string) {
    state.key = key
    state.vaultGeneration = vaultGeneration
    state.vaultId = vaultId
}

export function clearVaultRuntime() {
    state.key = null
    state.vaultGeneration = null
    state.vaultId = null
}
