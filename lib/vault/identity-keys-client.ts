"use client"

import { readVaultApiData } from "@/lib/vault/client"
import {
    provisionIdentityKeypair,
    recoverIdentityPrivateKey,
    type StoredIdentityKeypair,
} from "@/lib/vault/identity-keypair"
import { IdentityMaterialSchema, parseVaultData } from "@/lib/vault/client-schemas"

/**
 * Ensure the user has an identity keypair provisioned for the CURRENT vault
 * generation (ORG-E2EE-DESIGN.md §3a/§9), generating + publishing one if it is
 * absent or no longer unwraps under the current vault key, and re-publishing the
 * existing pair when only the generation moved (e.g. a vault password change).
 * Idempotent: a no-op when an up-to-date keypair already exists.
 *
 * MUST be called fail-open after a vault unlock — the caller is responsible for
 * swallowing rejections so this can never block unlock (the org-E2EE feature is
 * itself flag-gated; this only populates an otherwise-unused keypair). Returns
 * the public key now in use.
 */
export async function ensureIdentityKeypair(
    vaultKey: CryptoKey,
    vaultGeneration: number,
    vaultId: string,
): Promise<string> {
    const existing = await readVaultApiData(
        "/api/vault/identity",
        undefined,
        parseVaultData(IdentityMaterialSchema),
    )
    if (existing.identityPublicKey && existing.identityKeyGeneration === vaultGeneration) {
        return existing.identityPublicKey
    }

    // A generation bump does not necessarily mean a new vault key: a vault
    // password change re-wraps the SAME key under a new generation. If the stored
    // private key still unwraps, re-publish the existing pair under the current
    // generation. Generating a fresh pair here would orphan every org member key
    // sealed to the old public key and lock the user out of their team vault.
    let stored: StoredIdentityKeypair | null = null
    if (existing.identityPublicKey && existing.wrappedIdentityPrivateKey) {
        try {
            await recoverIdentityPrivateKey(existing.wrappedIdentityPrivateKey, vaultKey)
            stored = {
                identityPublicKey: existing.identityPublicKey,
                wrappedIdentityPrivateKey: existing.wrappedIdentityPrivateKey,
            }
        } catch {
            // Wrapped under a different vault key — fall through to a fresh pair.
        }
    }
    stored ??= await provisionIdentityKeypair(vaultKey)
    const body = JSON.stringify({
        identityPublicKey: stored.identityPublicKey,
        wrappedIdentityPrivateKey: stored.wrappedIdentityPrivateKey,
        vaultId,
        vaultGeneration,
    })

    // A member with no PUBLISHED identity key is invisible to org grants (an
    // admin can never reconcile them), and the caller swallows our rejection, so
    // a single transient failure would silently lock them out of team sharing.
    // Retry the publish a couple of times with backoff before giving up.
    let lastError: unknown
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            await readVaultApiData<{ identityPublicKey: string }>("/api/vault/identity", { method: "POST", body })
            return stored.identityPublicKey
        } catch (error) {
            lastError = error
            await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)))
        }
    }
    throw lastError
}
