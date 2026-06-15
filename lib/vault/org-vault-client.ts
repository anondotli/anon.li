"use client"

/**
 * Client orchestration for org shared-team E2EE (ORG-E2EE-DESIGN.md §3b/§5/§9).
 *
 * Glue between the proven crypto primitives ([lib/vault/org-vault-key.ts],
 * [lib/vault/identity-keypair.ts]) and the server endpoints
 * (`/api/vault/identity`, `/api/vault/org-keys`, `/api/vault/org-keys/{pending,
 * members,seed,rekey}`).
 *
 * The org vault key is a symmetric key shared across an org's members. Each
 * member holds it sealed to their identity public key (`OrganizationMemberKey`).
 * Org-owned Drop/Form owner keys are wrapped to THIS key (not a personal vault
 * key), so any granted member can open every org resource. Recovering it
 * requires the member's unlocked personal `vaultKey` (to recover their identity
 * private key) — so it can only happen while the vault is unlocked. Recovered
 * keys are cached in-memory for the page session, cleared on lock, and
 * invalidated across tabs by the VAULT_ORG_ROTATED broadcast after a rotation.
 *
 * `Organization.orgKeyGeneration` is the authoritative generation: seed/rotate
 * use a single-winner conditional bump server-side, and a member key whose
 * generation is below the org's current generation is treated as stale.
 */

import type { SealedBox } from "@/lib/crypto/asymmetric"
import { readVaultApiData, VaultApiError } from "@/lib/vault/client"
import {
    unwrapVaultManagedKey,
    unwrapVaultPayload,
    wrapVaultManagedKey,
    wrapVaultPayload,
} from "@/lib/vault/crypto"
import { recoverIdentityPrivateKey } from "@/lib/vault/identity-keypair"
import {
    generateOrgVaultKey,
    unwrapOrgVaultKeyForMember,
    wrapOrgVaultKeyForMember,
} from "@/lib/vault/org-vault-key"
import { broadcastVaultMessage } from "@/lib/vault/sync"

interface IdentityMaterial {
    identityPublicKey: string | null
    wrappedIdentityPrivateKey: string | null
    identityKeyGeneration: number | null
}

interface OwnMemberKey {
    wrappedOrgVaultKey: string
    orgKeyGeneration: number
}

interface OwnMemberKeyResponse {
    memberKey: OwnMemberKey | null
    currentGeneration: number
}

interface PendingMember {
    userId: string
    identityPublicKey: string
}

export interface OrgVaultKeyHandle {
    key: CryptoKey
    generation: number
}

/**
 * Discriminated access state so callers can show the right message:
 * - `granted`: the caller holds the current-generation org vault key.
 * - `awaiting-grant`: the caller is a member with a published identity key but
 *   has no current grant yet (an owner/admin must reconcile).
 * - `no-identity`: the caller hasn't provisioned their identity keypair (their
 *   vault may never have been unlocked since the feature shipped) — until they
 *   do, no admin can grant them.
 */
export type OrgVaultKeyResult =
    | { status: "granted"; handle: OrgVaultKeyHandle }
    | { status: "awaiting-grant" }
    | { status: "no-identity" }

// Recovered org vault keys live only in memory for the life of the page,
// mirroring the in-memory vault runtime key. Keyed by organizationId.
const orgVaultKeyCache = new Map<string, OrgVaultKeyHandle>()

/**
 * Drop cached org vault keys. With no argument clears all (call on vault lock /
 * sign-out); with an organizationId clears just that org (call on receiving a
 * VAULT_ORG_ROTATED broadcast).
 */
export function clearOrgVaultKeyCache(organizationId?: string): void {
    if (organizationId) orgVaultKeyCache.delete(organizationId)
    else orgVaultKeyCache.clear()
}

function serializeSealedBox(box: SealedBox): string {
    return JSON.stringify(box)
}

function parseSealedBox(serialized: string): SealedBox {
    return JSON.parse(serialized) as SealedBox
}

function isConflict(error: unknown): boolean {
    return error instanceof VaultApiError && error.code === "CONFLICT"
}

async function fetchIdentityMaterial(): Promise<IdentityMaterial> {
    return readVaultApiData<IdentityMaterial>("/api/vault/identity")
}

async function fetchOwnMemberKey(orgId: string): Promise<OwnMemberKeyResponse> {
    return readVaultApiData<OwnMemberKeyResponse>(
        `/api/vault/org-keys?organizationId=${encodeURIComponent(orgId)}`,
    )
}

async function grant(
    orgId: string,
    targetUserId: string,
    wrapped: SealedBox,
    generation: number,
): Promise<void> {
    await readVaultApiData("/api/vault/org-keys", {
        method: "POST",
        body: JSON.stringify({
            organizationId: orgId,
            targetUserId,
            wrappedOrgVaultKey: serializeSealedBox(wrapped),
            orgKeyGeneration: generation,
        }),
    })
}

/**
 * Resolve the caller's access to an org's shared vault key. Cache fast-path:
 * a cached handle is trusted (lock and the VAULT_ORG_ROTATED broadcast are what
 * invalidate it). On a cache miss it consults the authoritative generation: a
 * missing or stale-generation member key is NOT granted.
 */
async function resolveOrgVaultKey(orgId: string, vaultKey: CryptoKey): Promise<OrgVaultKeyResult> {
    const cached = orgVaultKeyCache.get(orgId)
    if (cached) return { status: "granted", handle: cached }

    const { memberKey, currentGeneration } = await fetchOwnMemberKey(orgId)

    // No usable grant: org unseeded, no key, or a key from before a rotation.
    if (!memberKey || currentGeneration === 0 || memberKey.orgKeyGeneration < currentGeneration) {
        const material = await fetchIdentityMaterial()
        return material.identityPublicKey ? { status: "awaiting-grant" } : { status: "no-identity" }
    }

    const material = await fetchIdentityMaterial()
    if (!material.wrappedIdentityPrivateKey) return { status: "no-identity" }

    const identityPrivateKey = await recoverIdentityPrivateKey(material.wrappedIdentityPrivateKey, vaultKey)
    const key = await unwrapOrgVaultKeyForMember(parseSealedBox(memberKey.wrappedOrgVaultKey), identityPrivateKey)
    const handle: OrgVaultKeyHandle = { key, generation: memberKey.orgKeyGeneration }
    orgVaultKeyCache.set(orgId, handle)
    return { status: "granted", handle }
}

/**
 * Recover the org vault key handle for `orgId` using the unlocked personal
 * `vaultKey`. Returns null when the caller has no current grant or no identity
 * keypair. Use [getOrgKeyAccessState] when you need to tell those two apart.
 */
export async function getOrgVaultKey(
    orgId: string,
    vaultKey: CryptoKey,
): Promise<OrgVaultKeyHandle | null> {
    const result = await resolveOrgVaultKey(orgId, vaultKey)
    return result.status === "granted" ? result.handle : null
}

/** Like [getOrgVaultKey] but returns the discriminated access state for the UI. */
export async function getOrgKeyAccessState(
    orgId: string,
    vaultKey: CryptoKey,
): Promise<OrgVaultKeyResult["status"]> {
    return (await resolveOrgVaultKey(orgId, vaultKey)).status
}

/**
 * Seed a freshly-created org with a new org vault key and self-grant it to the
 * creator. Goes through the single-winner `/seed` endpoint: if two admins race,
 * only one wins and the loser gets a 409 (swallowed — the winner's key will be
 * granted to them on the next reconcile). Requires the caller's identity keypair
 * to be published (provisioned fail-open on every vault unlock).
 */
export async function seedOrgVaultKey(orgId: string): Promise<void> {
    const { memberKey, currentGeneration } = await fetchOwnMemberKey(orgId)
    if (memberKey && currentGeneration > 0 && memberKey.orgKeyGeneration >= currentGeneration) return

    const material = await fetchIdentityMaterial()
    if (!material.identityPublicKey) {
        throw new Error("Identity keypair not provisioned — unlock your vault and retry")
    }

    const orgVaultKey = await generateOrgVaultKey()
    const wrapped = await wrapOrgVaultKeyForMember(orgVaultKey, material.identityPublicKey)
    try {
        await readVaultApiData("/api/vault/org-keys/seed", {
            method: "POST",
            body: JSON.stringify({ organizationId: orgId, wrappedOrgVaultKey: serializeSealedBox(wrapped) }),
        })
        // The recovered handle is now valid; cache it so the creator can
        // immediately wrap org-owned resources without a second round-trip.
        orgVaultKeyCache.set(orgId, { key: orgVaultKey, generation: 1 })
    } catch (error) {
        // Lost the seed race — another admin already established a (different)
        // org vault key. Drop our local key so the next read fetches the real one.
        orgVaultKeyCache.delete(orgId)
        if (!isConflict(error)) throw error
    }
}

/**
 * Owner/admin reconcile: grant the org vault key to every member who has
 * published an identity public key but holds no CURRENT-generation key yet
 * (decision §10.3). Seals at the org's authoritative current generation, and
 * only when the caller themselves holds that current generation (so we never
 * seal a stale key to others). Returns the number of members newly granted.
 * Fail-soft per member.
 */
async function reconcileOrgGrants(orgId: string, vaultKey: CryptoKey): Promise<number> {
    const handle = await getOrgVaultKey(orgId, vaultKey)
    if (!handle) return 0

    const { pending, currentGeneration } = await readVaultApiData<{ pending: PendingMember[]; currentGeneration: number }>(
        `/api/vault/org-keys/pending?organizationId=${encodeURIComponent(orgId)}`,
    )

    // Our key must be the current generation to grant it to others; otherwise we
    // would seal a soon-to-be-stale key. A fresh read/rotation will repair us.
    if (handle.generation !== currentGeneration) return 0

    let granted = 0
    for (const member of pending) {
        try {
            const wrapped = await wrapOrgVaultKeyForMember(handle.key, member.identityPublicKey)
            await grant(orgId, member.userId, wrapped, currentGeneration)
            granted++
        } catch {
            // Skip this member; a later reconcile retries.
        }
    }
    return granted
}

/**
 * Bring the caller's view of an org's shared E2EE into a consistent state, run
 * on team-page load. See the four outcomes inline.
 * Fail-soft: callers should swallow rejections (best-effort reconcile).
 */
export async function bootstrapOrgVault(opts: {
    orgId: string
    vaultKey: CryptoKey
    canManage: boolean
}): Promise<{ status: "ready" | "pending" | "seeded" | "granted"; grantedCount: number }> {
    const handle = await getOrgVaultKey(opts.orgId, opts.vaultKey)

    if (handle) {
        if (opts.canManage) {
            const grantedCount = await reconcileOrgGrants(opts.orgId, opts.vaultKey)
            return { status: "granted", grantedCount }
        }
        return { status: "ready", grantedCount: 0 }
    }

    if (!opts.canManage) {
        return { status: "pending", grantedCount: 0 }
    }

    const { seeded } = await readVaultApiData<{ pending: PendingMember[]; seeded: boolean; currentGeneration: number }>(
        `/api/vault/org-keys/pending?organizationId=${encodeURIComponent(opts.orgId)}`,
    )
    if (!seeded) {
        await seedOrgVaultKey(opts.orgId)
        const grantedCount = await reconcileOrgGrants(opts.orgId, opts.vaultKey)
        return { status: "seeded", grantedCount }
    }
    return { status: "pending", grantedCount: 0 }
}

/**
 * Rotate the org vault key (owner/admin) — true revocation (ORG-E2EE-DESIGN §6).
 * Builds the new key, ALL member re-grants, and ALL re-wrapped Drop/Form owner
 * keys client-side, then commits them in a SINGLE atomic `/rekey` POST (the
 * server bumps the generation single-winner and applies grants + re-wraps in one
 * transaction). After this, a removed member's stale key can no longer open the
 * re-wrapped owner keys. Broadcasts so other tabs drop their cached key.
 */
export async function rotateOrgVaultKey(
    orgId: string,
    vaultKey: CryptoKey,
): Promise<{ generation: number; members: number; rekeyed: number }> {
    const current = await getOrgVaultKey(orgId, vaultKey)
    if (!current) {
        throw new Error("You must hold the team key before rotating it")
    }

    const nextGeneration = current.generation + 1
    const newOrgVaultKey = await generateOrgVaultKey()

    // Re-grant the new key to every current member with a published pubkey.
    const { members } = await readVaultApiData<{ members: PendingMember[] }>(
        `/api/vault/org-keys/members?organizationId=${encodeURIComponent(orgId)}`,
    )
    const memberGrants: { userId: string; wrappedOrgVaultKey: string }[] = []
    for (const member of members) {
        const wrapped = await wrapOrgVaultKeyForMember(newOrgVaultKey, member.identityPublicKey)
        memberGrants.push({ userId: member.userId, wrappedOrgVaultKey: serializeSealedBox(wrapped) })
    }

    // Re-wrap every org-owned owner key from the old key to the new key.
    const { dropKeys, formKeys } = await readVaultApiData<{
        dropKeys: { id: string; wrappedKey: string }[]
        formKeys: { id: string; wrappedKey: string }[]
    }>(`/api/vault/org-keys/rekey?organizationId=${encodeURIComponent(orgId)}`)

    // Drop owner keys are raw AES content keys (AES-KW via wrapVaultManagedKey).
    const reDrop: { id: string; wrappedKey: string }[] = []
    for (const rec of dropKeys) {
        const raw = await crypto.subtle.exportKey("raw", await unwrapVaultManagedKey(rec.wrappedKey, current.key))
        reDrop.push({ id: rec.id, wrappedKey: await wrapVaultManagedKey(raw, newOrgVaultKey) })
    }
    // Form owner keys are PKCS#8 private keys wrapped as an AES-GCM payload
    // (wrapVaultPayload, AAD = the form owner-key context) — NOT AES-KW. Using
    // the managed-key path here would corrupt every org form's key on rotation.
    const reForm: { id: string; wrappedKey: string }[] = []
    for (const rec of formKeys) {
        const bytes = await unwrapVaultPayload(rec.wrappedKey, current.key)
        reForm.push({ id: rec.id, wrappedKey: await wrapVaultPayload(new Uint8Array(bytes), newOrgVaultKey) })
    }

    await readVaultApiData("/api/vault/org-keys/rekey", {
        method: "POST",
        body: JSON.stringify({
            organizationId: orgId,
            orgKeyGeneration: nextGeneration,
            memberGrants,
            dropKeys: reDrop,
            formKeys: reForm,
        }),
    })

    orgVaultKeyCache.set(orgId, { key: newOrgVaultKey, generation: nextGeneration })
    broadcastVaultMessage({
        type: "VAULT_ORG_ROTATED",
        organizationId: orgId,
        orgKeyGeneration: nextGeneration,
        timestamp: Date.now(),
        source: "org-rotate",
    })
    return { generation: nextGeneration, members: memberGrants.length, rekeyed: reDrop.length + reForm.length }
}
