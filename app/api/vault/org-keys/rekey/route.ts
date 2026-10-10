import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { apiError, apiSuccess, ErrorCodes, generateRequestId, withNoStore } from "@/lib/api-response"
import { logVaultError, logVaultWarn } from "@/lib/vault/api"
import { getVaultSession } from "@/lib/vault/server"
import { enforceVaultRequestGuards } from "@/lib/vault/http"
import { assertOrgVaultAccess, isOrgManager } from "@/lib/vault/org-access"
import { audit } from "@/lib/services/audit"
import { encryptedAliasMetadataSchema } from "@/lib/validations/alias"
import { CIPHERTEXT_HASH_PATTERN, hashNullableCiphertext } from "@/lib/vault/ciphertext-hash"

/**
 * Bulk re-key of org-owned owner keys for a team key ROTATION (ORG-E2EE §6).
 *
 * GET ?organizationId=… returns every org-owned Drop/Form owner key (wrapped to
 * the OLD org vault key) so an owner/admin's client can unwrap+re-wrap each to
 * the new key. POST stores the re-wrapped keys at the new generation. Both are
 * owner/admin only; every query is scoped to organizationId (tenant boundary).
 * The server only ever moves opaque ciphertext.
 *
 * Org alias labels/notes are encrypted directly with the org vault key, so the
 * GET also lists them (`aliasMetadata`) and the POST re-encrypted envelopes are
 * applied in the same rotation transaction. The client echoes EVERY listed
 * alias with hashes of the ciphertext it saw; the POST requires that exact set
 * and those exact ciphertexts, so a label edited (or first written) between GET
 * and POST fails the rotation with a retryable ROTATION_DATA_CHANGED instead of
 * being reverted or stranded under the old key. A field with no new value (a
 * legacy label still under its author's personal key) is left as-is.
 */

const ROUTE_NAME = "vault-org-keys-rekey"
const idSchema = z.string().min(1).max(64)
const MAX_REKEY_BODY_BYTES = 16 * 1024 * 1024

const rekeyItem = z.object({ id: z.string().min(1).max(64), wrappedKey: z.string().min(1).max(4096) })
const memberGrant = z.object({ userId: idSchema, wrappedOrgVaultKey: z.string().min(1).max(4096) })
const ciphertextHash = z.string().regex(CIPHERTEXT_HASH_PATTERN)
const aliasMetadataUpdate = z.object({
    id: idSchema,
    // SHA-256 of the ciphertext the client saw at GET (null = field was empty).
    previousLabelHash: ciphertextHash.nullable(),
    previousNoteHash: ciphertextHash.nullable(),
    encryptedLabel: encryptedAliasMetadataSchema.optional(),
    encryptedNote: encryptedAliasMetadataSchema.optional(),
}).strict()
    // Only an existing field can be re-encrypted.
    .refine((item) => item.encryptedLabel === undefined || item.previousLabelHash !== null)
    .refine((item) => item.encryptedNote === undefined || item.previousNoteHash !== null)
const rekeySchema = z.object({
    organizationId: idSchema,
    orgKeyGeneration: z.number().int().positive(),
    // Rotation is all-or-nothing, so an item-count cap can make a sufficiently
    // large organization impossible to rotate. Bound total bytes while reading
    // the body instead, alongside per-field limits, CSRF, and rate limiting.
    memberGrants: z.array(memberGrant),
    dropKeys: z.array(rekeyItem),
    formKeys: z.array(rekeyItem),
    // Optional for clients that predate org-key alias metadata.
    aliasMetadata: z.array(aliasMetadataUpdate).default([]),
})

class StaleGenerationError extends Error {}
class RotationPayloadMismatchError extends Error {}
class RotationBodyTooLargeError extends Error {}

async function readRotationBody(request: Request): Promise<unknown> {
    const contentLength = Number(request.headers.get("content-length"))
    if (Number.isFinite(contentLength) && contentLength > MAX_REKEY_BODY_BYTES) {
        throw new RotationBodyTooLargeError()
    }

    if (!request.body) return null

    const reader = request.body.getReader()
    const decoder = new TextDecoder()
    let bytesRead = 0
    let text = ""

    while (true) {
        const { done, value } = await reader.read()
        if (done) break

        bytesRead += value.byteLength
        if (bytesRead > MAX_REKEY_BODY_BYTES) {
            await reader.cancel().catch(() => undefined)
            throw new RotationBodyTooLargeError()
        }
        text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()

    try {
        return JSON.parse(text) as unknown
    } catch {
        return null
    }
}

/**
 * A rotation payload must contain each current server-side id exactly once.
 * Building the expected set here also makes this defensive against unexpected
 * duplicate rows returned by a future query/schema change.
 */
function assertExactIds(expectedIds: Iterable<string>, payloadIds: string[]): void {
    const expected = new Set(expectedIds)
    const supplied = new Set(payloadIds)

    if (
        supplied.size !== payloadIds.length
        || supplied.size !== expected.size
        || [...expected].some((id) => !supplied.has(id))
    ) {
        throw new RotationPayloadMismatchError()
    }
}

export async function GET(request: Request) {
    const requestId = generateRequestId()
    try {
        const session = await getVaultSession()
        if (!session) {
            logVaultWarn(ROUTE_NAME, "Unauthorized rekey listing", { requestId })
            return withNoStore(apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, requestId, 401))
        }

        const blocked = await enforceVaultRequestGuards({ request, requestId, identifier: session.user.id, route: ROUTE_NAME })
        if (blocked) return blocked

        const organizationId = new URL(request.url).searchParams.get("organizationId")
        if (!organizationId || !idSchema.safeParse(organizationId).success) {
            return withNoStore(apiError("Invalid organizationId", ErrorCodes.VALIDATION_ERROR, requestId, 400))
        }
        if (!(await isOrgManager(session.user.id, organizationId))) {
            return withNoStore(apiError("Insufficient organization role", ErrorCodes.FORBIDDEN, requestId, 403))
        }

        const policyBlocked = await assertOrgVaultAccess({ user: session.user, organizationId, requestId })
        if (policyBlocked) return policyBlocked

        const [dropKeys, formKeys, aliasMetadata] = await Promise.all([
            prisma.dropOwnerKey.findMany({
                where: { organizationId: organizationId },
                select: { dropId: true, wrappedKey: true },
            }),
            prisma.formOwnerKey.findMany({
                where: { organizationId: organizationId },
                select: { formId: true, wrappedKey: true },
            }),
            prisma.alias.findMany({
                where: {
                    organizationId,
                    OR: [{ encryptedLabel: { not: null } }, { encryptedNote: { not: null } }],
                },
                select: { id: true, encryptedLabel: true, encryptedNote: true },
            }),
        ])

        return withNoStore(apiSuccess({
            dropKeys: dropKeys.map((k) => ({ id: k.dropId, wrappedKey: k.wrappedKey })),
            formKeys: formKeys.map((k) => ({ id: k.formId, wrappedKey: k.wrappedKey })),
            aliasMetadata,
        }, requestId))
    } catch (error) {
        logVaultError(ROUTE_NAME, "Rekey listing failed", error, { requestId })
        return withNoStore(apiError("Internal server error", ErrorCodes.INTERNAL_ERROR, requestId, 500))
    }
}

export async function POST(request: Request) {
    const requestId = generateRequestId()
    try {
        const session = await getVaultSession()
        if (!session) {
            logVaultWarn(ROUTE_NAME, "Unauthorized rekey store", { requestId })
            return withNoStore(apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, requestId, 401))
        }

        const blocked = await enforceVaultRequestGuards({ request, requestId, identifier: session.user.id, route: ROUTE_NAME, csrf: true })
        if (blocked) return blocked

        let body: unknown
        try {
            body = await readRotationBody(request)
        } catch (error) {
            if (error instanceof RotationBodyTooLargeError) {
                return withNoStore(apiError(
                    "Rotation payload exceeds the 16 MiB atomic request limit",
                    ErrorCodes.VALIDATION_ERROR,
                    requestId,
                    413,
                ))
            }
            throw error
        }
        const validation = rekeySchema.safeParse(body)
        if (!validation.success) {
            return withNoStore(apiError("Invalid request body", ErrorCodes.VALIDATION_ERROR, requestId, 400))
        }
        const { organizationId, orgKeyGeneration, memberGrants, dropKeys, formKeys, aliasMetadata } = validation.data
        if (new Set(aliasMetadata.map((a) => a.id)).size !== aliasMetadata.length) {
            return withNoStore(apiError("Invalid request body", ErrorCodes.VALIDATION_ERROR, requestId, 400))
        }

        if (!(await isOrgManager(session.user.id, organizationId))) {
            return withNoStore(apiError("Insufficient organization role", ErrorCodes.FORBIDDEN, requestId, 403))
        }

        const policyBlocked = await assertOrgVaultAccess({ user: session.user, organizationId, requestId, write: true })
        if (policyBlocked) return policyBlocked

        // ATOMIC ROTATION (ORG-E2EE §6): bump the org generation, re-grant the new
        // key to every current member, and re-wrap every org-owned owner key — all
        // in ONE transaction, so a failure leaves NOTHING half-rotated (members on a
        // new generation while resources are still on the old one = unreadable). The
        // generation bump is single-winner (conditional on the prior generation) so
        // two concurrent rotations can't both commit. Every write is scoped to
        // organizationId so a forged id can't touch another org or a personal key.
        try {
            await prisma.$transaction(async (tx) => {
                const bumped = await tx.organization.updateMany({
                    where: { id: organizationId, orgKeyGeneration: orgKeyGeneration - 1 },
                    data: { orgKeyGeneration, keyRotationRecommendedAt: null },
                })
                if (bumped.count !== 1) {
                    throw new StaleGenerationError()
                }

                // The client prepares these three lists from separate GETs. Re-read
                // their authoritative sets inside the write transaction and require
                // an exact, duplicate-free match. Any join/leave or resource change
                // makes this transaction throw, rolling back both the generation bump
                // and keyRotationRecommendedAt clear instead of committing a partial
                // rotation that strands keys at the old generation.
                const [members, currentDropKeys, currentFormKeys] = await Promise.all([
                    tx.member.findMany({
                        // Members without a published identity key cannot receive
                        // an encrypted grant yet and are intentionally omitted by
                        // the client-facing /members endpoint as well. They enter
                        // the pending-grant flow after creating identity material.
                        where: {
                            organizationId,
                            user: { security: { identityPublicKey: { not: null } } },
                        },
                        select: { userId: true },
                    }),
                    tx.dropOwnerKey.findMany({
                        where: { organizationId },
                        select: { dropId: true },
                    }),
                    tx.formOwnerKey.findMany({
                        where: { organizationId },
                        select: { formId: true },
                    }),
                ])

                assertExactIds(members.map((m) => m.userId), memberGrants.map((g) => g.userId))
                assertExactIds(currentDropKeys.map((k) => k.dropId), dropKeys.map((k) => k.id))
                assertExactIds(currentFormKeys.map((k) => k.formId), formKeys.map((k) => k.id))

                for (const g of memberGrants) {
                    await tx.organizationMemberKey.upsert({
                        where: { organizationId_userId: { organizationId, userId: g.userId } },
                        create: { organizationId, userId: g.userId, wrappedOrgVaultKey: g.wrappedOrgVaultKey, orgKeyGeneration },
                        update: { wrappedOrgVaultKey: g.wrappedOrgVaultKey, orgKeyGeneration },
                    })
                }

                for (const k of dropKeys) {
                    const updated = await tx.dropOwnerKey.updateMany({
                        where: { dropId: k.id, organizationId },
                        data: { wrappedKey: k.wrappedKey, orgKeyGeneration },
                    })
                    if (updated.count !== 1) {
                        throw new RotationPayloadMismatchError()
                    }
                }
                for (const k of formKeys) {
                    const updated = await tx.formOwnerKey.updateMany({
                        where: { formId: k.id, organizationId },
                        data: { wrappedKey: k.wrappedKey, orgKeyGeneration },
                    })
                    if (updated.count !== 1) {
                        throw new RotationPayloadMismatchError()
                    }
                }
                // Org alias labels/notes: the payload must cover exactly the org's
                // aliases that carry metadata NOW, each with the ciphertext the
                // client saw. A label edited or first written since the GET would
                // otherwise be reverted or left on the old key.
                const currentAliases = await tx.alias.findMany({
                    where: {
                        organizationId,
                        OR: [{ encryptedLabel: { not: null } }, { encryptedNote: { not: null } }],
                    },
                    select: { id: true, encryptedLabel: true, encryptedNote: true },
                })
                assertExactIds(currentAliases.map((a) => a.id), aliasMetadata.map((a) => a.id))
                const currentById = new Map(currentAliases.map((a) => [a.id, a]))

                for (const a of aliasMetadata) {
                    const currentAlias = currentById.get(a.id)!
                    if (
                        (await hashNullableCiphertext(currentAlias.encryptedLabel)) !== a.previousLabelHash
                        || (await hashNullableCiphertext(currentAlias.encryptedNote)) !== a.previousNoteHash
                    ) {
                        throw new RotationPayloadMismatchError()
                    }
                    if (a.encryptedLabel === undefined && a.encryptedNote === undefined) continue

                    // Compare-and-swap on the verified ciphertext, scoped to this
                    // org so a forged id can never touch another org's or a
                    // personal alias.
                    const updated = await tx.alias.updateMany({
                        where: {
                            id: a.id,
                            organizationId,
                            encryptedLabel: currentAlias.encryptedLabel,
                            encryptedNote: currentAlias.encryptedNote,
                        },
                        data: {
                            ...(a.encryptedLabel !== undefined ? { encryptedLabel: a.encryptedLabel } : {}),
                            ...(a.encryptedNote !== undefined ? { encryptedNote: a.encryptedNote } : {}),
                        },
                    })
                    if (updated.count !== 1) {
                        throw new RotationPayloadMismatchError()
                    }
                }
            }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
        } catch (error) {
            if (
                error instanceof StaleGenerationError
                || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")
            ) {
                return withNoStore(apiError("Concurrent rotation; refresh and retry", ErrorCodes.CONFLICT, requestId, 409))
            }
            if (error instanceof RotationPayloadMismatchError) {
                // Retryable: nothing was committed; re-prepare from fresh data.
                return withNoStore(apiError("Rotation data changed; refresh and retry", ErrorCodes.ROTATION_DATA_CHANGED, requestId, 409))
            }
            throw error
        }

        void audit({
            action: "org.vault.rotate",
            actorId: session.user.id,
            organizationId,
            metadata: {
                orgKeyGeneration,
                members: memberGrants.length,
                dropKeys: dropKeys.length,
                formKeys: formKeys.length,
                aliasMetadata: aliasMetadata.length,
            },
        })

        return withNoStore(apiSuccess({
            organizationId,
            orgKeyGeneration,
            members: memberGrants.length,
            rekeyed: dropKeys.length + formKeys.length,
            aliasMetadata: aliasMetadata.length,
        }, requestId))
    } catch (error) {
        logVaultError(ROUTE_NAME, "Rekey store failed", error, { requestId })
        return withNoStore(apiError("Internal server error", ErrorCodes.INTERNAL_ERROR, requestId, 500))
    }
}
