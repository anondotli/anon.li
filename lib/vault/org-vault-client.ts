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
import { rekeyAliasMetadata } from "@/components/alias/alias-metadata-key"
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
import { hashCiphertext, hashNullableCiphertext } from "@/lib/vault/ciphertext-hash"
import {
    ORG_KEY_GENERATION_MISMATCH_CODE,
    ORG_KEY_LAST_HOLDER_CODE,
    ROTATION_DATA_CHANGED_CODE,
} from "@/lib/vault/error-codes"
import {
    IdentityMaterialSchema,
    OwnMemberKeyResponseSchema,
    PendingMemberSchema,
    parseVaultData,
} from "@/lib/vault/client-schemas"
import { z } from "zod"

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

const SealedBoxSchema = z.object({
    ephemeralPublicKey: z.string().regex(/^[A-Za-z0-9_-]{87}$/),
    iv: z.string().regex(/^[A-Za-z0-9_-]{16}$/),
    ciphertext: z.string().min(1).max(1_024).regex(/^[A-Za-z0-9_-]+$/),
}).strict()

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
 * - `regrant-required`: the caller HAD a grant but it can't be opened with
 *   their current identity key (e.g. sealed to a key replaced before the
 *   identity-key fix). The unusable grant has been released so an admin's next
 *   reconcile re-shares the team key.
 * - `key-unrecoverable`: the caller's grant can't be opened AND nobody else
 *   holds the current team key, so the server refused to release it (it might
 *   still be the only copy). Needs support, not an admin re-grant.
 */
export type OrgVaultKeyResult =
    | { status: "granted"; handle: OrgVaultKeyHandle }
    | { status: "awaiting-grant" }
    | { status: "no-identity" }
    | { status: "regrant-required" }
    | { status: "key-unrecoverable" }

/** User-facing explanation for the `regrant-required` state. */
export const ORG_KEY_REGRANT_REQUIRED_MESSAGE =
    "Your team key needs to be re-shared by an admin. Ask a team owner or admin to open the team page so it's re-shared automatically."

/** User-facing explanation for the `key-unrecoverable` state. */
export const ORG_KEY_UNRECOVERABLE_MESSAGE =
    "Your copy of the team key can't be opened, and no other member holds the current team key, so the team's encrypted data may be unrecoverable. Please contact support before changing anything."

// Recovered org vault keys live only in memory for the life of the page,
// mirroring the in-memory vault runtime key. Keyed by organizationId.
const orgVaultKeyCache = new Map<string, OrgVaultKeyHandle>()

// Orgs whose grant this page released as unopenable. After the release the
// server just reports "no grant", so remember why to keep the message accurate
// until a fresh grant arrives.
const releasedGrantOrgIds = new Set<string>()
// Orgs where the server refused the release because we're the last holder.
const unrecoverableOrgIds = new Set<string>()

/**
 * Drop cached org vault keys. With no argument clears all (call on vault lock /
 * sign-out); with an organizationId clears just that org (call on receiving a
 * VAULT_ORG_ROTATED broadcast).
 */
export function clearOrgVaultKeyCache(organizationId?: string): void {
    if (organizationId) orgVaultKeyCache.delete(organizationId)
    else orgVaultKeyCache.clear()
}

/**
 * Feed in an org key generation seen on any server response (org owner keys,
 * member keys, …). A cached handle older than that generation is from before a
 * rotation done on another device/tab that never reached us via broadcast —
 * evict it so the next use fetches the current grant.
 */
export function observeOrgKeyGeneration(
    organizationId: string | null | undefined,
    generation: number | null | undefined,
): void {
    if (!organizationId || generation == null) return
    const cached = orgVaultKeyCache.get(organizationId)
    if (cached && cached.generation < generation) orgVaultKeyCache.delete(organizationId)
}

/** True for an error / action result carrying ORG_KEY_GENERATION_MISMATCH. */
function isOrgKeyGenerationMismatch(value: unknown): boolean {
    return typeof value === "object"
        && value !== null
        && (value as { code?: unknown }).code === ORG_KEY_GENERATION_MISMATCH_CODE
}

/**
 * Run an org-key-encrypted write; if the server rejects it with
 * ORG_KEY_GENERATION_MISMATCH (the team key was rotated elsewhere), drop the
 * cached org key and run it ONCE more. `attempt` must fetch the org key itself
 * (e.g. via getOrgVaultKeyHandle) on every call so the retry re-encrypts with
 * the current key. Handles both thrown errors and returned `{ code }` results.
 */
export async function withOrgKeyGenerationRetry<T>(
    organizationId: string,
    attempt: () => Promise<T>,
): Promise<T> {
    try {
        const result = await attempt()
        if (!isOrgKeyGenerationMismatch(result)) return result
    } catch (error) {
        if (!isOrgKeyGenerationMismatch(error)) throw error
    }
    clearOrgVaultKeyCache(organizationId)
    return attempt()
}

/** WebCrypto's "authentication failed" — the sealed box didn't open with this key. */
function isCryptoOperationError(error: unknown): boolean {
    return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "OperationError"
}

function serializeSealedBox(box: SealedBox): string {
    return JSON.stringify(box)
}

function parseSealedBox(serialized: string): SealedBox {
    const value: unknown = JSON.parse(serialized)
    const parsed = SealedBoxSchema.safeParse(value)
    if (!parsed.success) throw new Error("Invalid sealed team key")
    return parsed.data
}

function isConflict(error: unknown): boolean {
    return error instanceof VaultApiError && error.code === "CONFLICT"
}

async function fetchIdentityMaterial(): Promise<IdentityMaterial> {
    return readVaultApiData("/api/vault/identity", undefined, parseVaultData(IdentityMaterialSchema))
}

async function fetchOwnMemberKey(orgId: string): Promise<OwnMemberKeyResponse> {
    const response = await readVaultApiData(
        `/api/vault/org-keys?organizationId=${encodeURIComponent(orgId)}`,
        undefined,
        parseVaultData(OwnMemberKeyResponseSchema),
    )
    observeOrgKeyGeneration(orgId, response.currentGeneration)
    return response
}

/**
 * Release the caller's OWN member-key grant for an org so they show up as
 * pending for re-grant. Compare-and-delete: names the exact grant (generation +
 * hash) that failed to open, so a newer grant is never removed.
 */
async function releaseOwnMemberKey(orgId: string, memberKey: OwnMemberKey): Promise<void> {
    const query = new URLSearchParams({
        organizationId: orgId,
        orgKeyGeneration: String(memberKey.orgKeyGeneration),
        wrappedKeyHash: await hashCiphertext(memberKey.wrappedOrgVaultKey),
    })
    await readVaultApiData(`/api/vault/org-keys/own?${query.toString()}`, { method: "DELETE" })
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
async function resolveOrgVaultKey(
    orgId: string,
    vaultKey: CryptoKey,
    retryOnGrantChange = true,
): Promise<OrgVaultKeyResult> {
    const cached = orgVaultKeyCache.get(orgId)
    if (cached) return { status: "granted", handle: cached }

    const { memberKey, currentGeneration } = await fetchOwnMemberKey(orgId)

    // No usable grant: org unseeded, no key, or a key from before a rotation.
    if (!memberKey || currentGeneration === 0 || memberKey.orgKeyGeneration < currentGeneration) {
        const material = await fetchIdentityMaterial()
        if (!material.identityPublicKey) return { status: "no-identity" }
        return releasedGrantOrgIds.has(orgId) ? { status: "regrant-required" } : { status: "awaiting-grant" }
    }

    const material = await fetchIdentityMaterial()
    if (!material.wrappedIdentityPrivateKey) return { status: "no-identity" }

    const identityPrivateKey = await recoverIdentityPrivateKey(material.wrappedIdentityPrivateKey, vaultKey)

    // Malformed/unparseable grant data is NOT evidence the grant is unusable
    // (could be a client/schema mismatch) — surface it, never release on it.
    const sealedBox = parseSealedBox(memberKey.wrappedOrgVaultKey)

    // The identity private key opened with the vault key, so an AES-GCM
    // authentication failure (OperationError) HERE is definitively the grant
    // itself: sealed to a different identity key. Such a grant can never be
    // opened, yet as long as it exists the server counts the member as granted
    // and no admin will ever re-grant. Release it (self-heal).
    let key: CryptoKey
    try {
        key = await unwrapOrgVaultKeyForMember(sealedBox, identityPrivateKey)
    } catch (error) {
        if (!isCryptoOperationError(error)) throw error
        if (unrecoverableOrgIds.has(orgId)) return { status: "key-unrecoverable" }
        try {
            await releaseOwnMemberKey(orgId, memberKey)
        } catch (releaseError) {
            if (releaseError instanceof VaultApiError && releaseError.code === ORG_KEY_LAST_HOLDER_CODE) {
                unrecoverableOrgIds.add(orgId)
                return { status: "key-unrecoverable" }
            }
            // The grant changed under us (e.g. an admin just re-granted): look again.
            if (isConflict(releaseError) && retryOnGrantChange) {
                return resolveOrgVaultKey(orgId, vaultKey, false)
            }
            throw releaseError
        }
        releasedGrantOrgIds.add(orgId)
        return { status: "regrant-required" }
    }

    releasedGrantOrgIds.delete(orgId)
    unrecoverableOrgIds.delete(orgId)
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

    const { pending, currentGeneration } = await readVaultApiData(
        `/api/vault/org-keys/pending?organizationId=${encodeURIComponent(orgId)}`,
        undefined,
        parseVaultData(z.object({
            pending: PendingMemberSchema.array(),
            currentGeneration: z.number().int().nonnegative(),
            seeded: z.boolean(),
        }).strict()),
    )

    observeOrgKeyGeneration(orgId, currentGeneration)
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
}): Promise<{
    status: "ready" | "pending" | "seeded" | "granted" | "regrant-required" | "key-unrecoverable"
    grantedCount: number
}> {
    const handle = await getOrgVaultKey(opts.orgId, opts.vaultKey)

    // Our own grant was unopenable and has just been released; another
    // owner/admin has to re-share the key (UI: ORG_KEY_REGRANT_REQUIRED_MESSAGE).
    if (!handle && releasedGrantOrgIds.has(opts.orgId)) {
        return { status: "regrant-required", grantedCount: 0 }
    }
    if (!handle && unrecoverableOrgIds.has(opts.orgId)) {
        return { status: "key-unrecoverable", grantedCount: 0 }
    }

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

    const { seeded } = await readVaultApiData(
        `/api/vault/org-keys/pending?organizationId=${encodeURIComponent(opts.orgId)}`,
        undefined,
        parseVaultData(z.object({
            pending: PendingMemberSchema.array(),
            seeded: z.boolean(),
            currentGeneration: z.number().int().nonnegative(),
        }).strict()),
    )
    if (!seeded) {
        await seedOrgVaultKey(opts.orgId)
        const grantedCount = await reconcileOrgGrants(opts.orgId, opts.vaultKey)
        return { status: "seeded", grantedCount }
    }
    return { status: "pending", grantedCount: 0 }
}

interface AliasMetadataRotationItem {
    id: string
    previousLabelHash: string | null
    previousNoteHash: string | null
    encryptedLabel?: string
    encryptedNote?: string
}

/**
 * Rotate the org vault key (owner/admin) — true revocation (ORG-E2EE-DESIGN §6).
 * Builds the new key, ALL member re-grants, and ALL re-wrapped Drop/Form owner
 * keys client-side, then commits them in a SINGLE atomic `/rekey` POST (the
 * server bumps the generation single-winner and applies grants + re-wraps in one
 * transaction). After this, a removed member's stale key can no longer open the
 * re-wrapped owner keys. Broadcasts so other tabs drop their cached key.
 *
 * If the server reports ROTATION_DATA_CHANGED (a member joined/left, a resource
 * or an org alias label changed between preparing and committing), nothing was
 * committed; the whole rotation is re-prepared from fresh data and retried once.
 */
export async function rotateOrgVaultKey(
    orgId: string,
    vaultKey: CryptoKey,
): Promise<{ generation: number; members: number; rekeyed: number }> {
    try {
        return await attemptOrgVaultKeyRotation(orgId, vaultKey)
    } catch (error) {
        if (!(error instanceof VaultApiError && error.code === ROTATION_DATA_CHANGED_CODE)) throw error
        return attemptOrgVaultKeyRotation(orgId, vaultKey)
    }
}

async function attemptOrgVaultKeyRotation(
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
    const { members } = await readVaultApiData(
        `/api/vault/org-keys/members?organizationId=${encodeURIComponent(orgId)}`,
        undefined,
        parseVaultData(z.object({ members: PendingMemberSchema.array() }).strict()),
    )
    const memberGrants: { userId: string; wrappedOrgVaultKey: string }[] = []
    for (const member of members) {
        const wrapped = await wrapOrgVaultKeyForMember(newOrgVaultKey, member.identityPublicKey)
        memberGrants.push({ userId: member.userId, wrappedOrgVaultKey: serializeSealedBox(wrapped) })
    }

    // Re-wrap every org-owned owner key from the old key to the new key.
    const ownerKeyRecord = z.object({
        id: z.string().min(1).max(64),
        wrappedKey: z.string().min(16).max(2_048).regex(/^[A-Za-z0-9_-]+$/),
    }).strict()
    const aliasEnvelope = z.string().min(1).max(2_048).nullable()
    const { dropKeys, formKeys, aliasMetadata } = await readVaultApiData(
        `/api/vault/org-keys/rekey?organizationId=${encodeURIComponent(orgId)}`,
        undefined,
        parseVaultData(z.object({
            dropKeys: ownerKeyRecord.array(),
            formKeys: ownerKeyRecord.array(),
            aliasMetadata: z.object({
                id: z.string().min(1).max(64),
                encryptedLabel: aliasEnvelope,
                encryptedNote: aliasEnvelope,
            }).strict().array().default([]),
        }).strict()),
    )

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

    // Org alias labels/notes are encrypted directly with the org vault key.
    // A field that doesn't open with the current org key is a legacy label still
    // under its author's PERSONAL key — leave it untouched (no new value) rather
    // than failing the whole rotation; it never depended on the org key anyway.
    // EVERY listed alias is echoed back with hashes of the ciphertext we saw, so
    // the server can refuse (ROTATION_DATA_CHANGED) if any label was edited or
    // first written in between — instead of reverting it or stranding it on the
    // old key.
    const reAlias: AliasMetadataRotationItem[] = []
    for (const rec of aliasMetadata) {
        const update: AliasMetadataRotationItem = {
            id: rec.id,
            previousLabelHash: await hashNullableCiphertext(rec.encryptedLabel),
            previousNoteHash: await hashNullableCiphertext(rec.encryptedNote),
        }
        for (const field of ["label", "note"] as const) {
            const envelope = field === "label" ? rec.encryptedLabel : rec.encryptedNote
            if (!envelope) continue
            try {
                const rekeyed = await rekeyAliasMetadata(envelope, current.key, newOrgVaultKey, { aliasId: rec.id, field })
                if (field === "label") update.encryptedLabel = rekeyed
                else update.encryptedNote = rekeyed
            } catch {
                // Not under the org key (legacy personal-key envelope): keep as-is.
            }
        }
        reAlias.push(update)
    }

    await readVaultApiData("/api/vault/org-keys/rekey", {
        method: "POST",
        body: JSON.stringify({
            organizationId: orgId,
            orgKeyGeneration: nextGeneration,
            memberGrants,
            dropKeys: reDrop,
            formKeys: reForm,
            aliasMetadata: reAlias,
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
