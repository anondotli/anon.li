import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { apiError, apiSuccess, ErrorCodes, generateRequestId, withNoStore } from "@/lib/api-response"
import { logVaultError, logVaultWarn } from "@/lib/vault/api"
import { getVaultSession } from "@/lib/vault/server"
import { getVaultSchemaState, VAULT_SCHEMA_UNAVAILABLE_MESSAGE } from "@/lib/vault/schema"
import { enforceVaultRequestGuards } from "@/lib/vault/http"
import { isOrgManager } from "@/lib/vault/org-access"
import { audit } from "@/lib/services/audit"

/**
 * Bulk re-key of org-owned owner keys for a team key ROTATION (ORG-E2EE §6).
 *
 * GET ?organizationId=… returns every org-owned Drop/Form owner key (wrapped to
 * the OLD org vault key) so an owner/admin's client can unwrap+re-wrap each to
 * the new key. POST stores the re-wrapped keys at the new generation. Both are
 * owner/admin only; every query is scoped to organizationId (tenant boundary).
 * The server only ever moves opaque ciphertext.
 */

const ROUTE_NAME = "vault-org-keys-rekey"
const idSchema = z.string().min(1).max(64)

const rekeyItem = z.object({ id: z.string().min(1).max(64), wrappedKey: z.string().min(1).max(4096) })
const memberGrant = z.object({ userId: idSchema, wrappedOrgVaultKey: z.string().min(1).max(4096) })
const rekeySchema = z.object({
    organizationId: idSchema,
    orgKeyGeneration: z.number().int().positive(),
    memberGrants: z.array(memberGrant).max(10000),
    dropKeys: z.array(rekeyItem).max(10000),
    formKeys: z.array(rekeyItem).max(10000),
})

class StaleGenerationError extends Error {}

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

        const vaultSchema = await getVaultSchemaState()
        if (!vaultSchema.dropOwnerKeys || !vaultSchema.formOwnerKeys) {
            return withNoStore(apiError(VAULT_SCHEMA_UNAVAILABLE_MESSAGE, ErrorCodes.SERVICE_UNAVAILABLE, requestId, 503))
        }

        const organizationId = new URL(request.url).searchParams.get("organizationId")
        if (!idSchema.safeParse(organizationId).success) {
            return withNoStore(apiError("Invalid organizationId", ErrorCodes.VALIDATION_ERROR, requestId, 400))
        }
        if (!(await isOrgManager(session.user.id, organizationId!))) {
            return withNoStore(apiError("Insufficient organization role", ErrorCodes.FORBIDDEN, requestId, 403))
        }

        const [dropKeys, formKeys] = await Promise.all([
            prisma.dropOwnerKey.findMany({
                where: { organizationId: organizationId! },
                select: { dropId: true, wrappedKey: true },
            }),
            prisma.formOwnerKey.findMany({
                where: { organizationId: organizationId! },
                select: { formId: true, wrappedKey: true },
            }),
        ])

        return withNoStore(apiSuccess({
            dropKeys: dropKeys.map((k) => ({ id: k.dropId, wrappedKey: k.wrappedKey })),
            formKeys: formKeys.map((k) => ({ id: k.formId, wrappedKey: k.wrappedKey })),
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

        const vaultSchema = await getVaultSchemaState()
        if (!vaultSchema.organizationMemberKeys || !vaultSchema.dropOwnerKeys || !vaultSchema.formOwnerKeys) {
            return withNoStore(apiError(VAULT_SCHEMA_UNAVAILABLE_MESSAGE, ErrorCodes.SERVICE_UNAVAILABLE, requestId, 503))
        }

        const body = await request.json().catch(() => null)
        const validation = rekeySchema.safeParse(body)
        if (!validation.success) {
            return withNoStore(apiError("Invalid request body", ErrorCodes.VALIDATION_ERROR, requestId, 400))
        }
        const { organizationId, orgKeyGeneration, memberGrants, dropKeys, formKeys } = validation.data

        if (!(await isOrgManager(session.user.id, organizationId))) {
            return withNoStore(apiError("Insufficient organization role", ErrorCodes.FORBIDDEN, requestId, 403))
        }

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
                if (bumped.count === 0) {
                    throw new StaleGenerationError()
                }

                // Only re-grant to actual current members (defense-in-depth against a
                // forged userId in the payload). Removed members were already deleted
                // from OrganizationMemberKey by the afterRemoveMember hook.
                const members = await tx.member.findMany({
                    where: { organizationId },
                    select: { userId: true },
                })
                const memberIds = new Set(members.map((m) => m.userId))
                for (const g of memberGrants) {
                    if (!memberIds.has(g.userId)) continue
                    await tx.organizationMemberKey.upsert({
                        where: { organizationId_userId: { organizationId, userId: g.userId } },
                        create: { organizationId, userId: g.userId, wrappedOrgVaultKey: g.wrappedOrgVaultKey, orgKeyGeneration },
                        update: { wrappedOrgVaultKey: g.wrappedOrgVaultKey, orgKeyGeneration },
                    })
                }

                for (const k of dropKeys) {
                    await tx.dropOwnerKey.updateMany({
                        where: { dropId: k.id, organizationId },
                        data: { wrappedKey: k.wrappedKey, orgKeyGeneration },
                    })
                }
                for (const k of formKeys) {
                    await tx.formOwnerKey.updateMany({
                        where: { formId: k.id, organizationId },
                        data: { wrappedKey: k.wrappedKey, orgKeyGeneration },
                    })
                }
            })
        } catch (error) {
            if (error instanceof StaleGenerationError) {
                return withNoStore(apiError("Concurrent rotation; refresh and retry", ErrorCodes.CONFLICT, requestId, 409))
            }
            throw error
        }

        void audit({
            action: "org.vault.rotate",
            actorId: session.user.id,
            organizationId,
            metadata: { orgKeyGeneration, members: memberGrants.length, dropKeys: dropKeys.length, formKeys: formKeys.length },
        })

        return withNoStore(apiSuccess({ organizationId, orgKeyGeneration, members: memberGrants.length, rekeyed: dropKeys.length + formKeys.length }, requestId))
    } catch (error) {
        logVaultError(ROUTE_NAME, "Rekey store failed", error, { requestId })
        return withNoStore(apiError("Internal server error", ErrorCodes.INTERNAL_ERROR, requestId, 500))
    }
}
