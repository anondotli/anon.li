import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { apiError, apiSuccess, ErrorCodes, generateRequestId, withNoStore } from "@/lib/api-response"
import { logVaultError, logVaultWarn } from "@/lib/vault/api"
import { getVaultSession } from "@/lib/vault/server"
import { getVaultSchemaState, VAULT_SCHEMA_UNAVAILABLE_MESSAGE } from "@/lib/vault/schema"
import { enforceVaultRequestGuards } from "@/lib/vault/http"
import { isOrgManager } from "@/lib/vault/org-access"
import { audit } from "@/lib/services/audit"

/**
 * Seed an org's shared-team E2EE key (ORG-E2EE-DESIGN.md §5) — single-winner.
 *
 * An owner/admin's client generates a fresh org vault key, seals it to its OWN
 * identity public key, and POSTs the wrapped blob here. The server moves the org
 * from generation 0 (unseeded) to 1 with a CONDITIONAL update inside a
 * transaction, so if two admins race only ONE wins (the loser gets 409 and
 * should re-fetch + await/grant). This prevents the split-brain where two
 * different org vault keys get sealed to different members. The server never
 * sees the plaintext org vault key.
 */

const ROUTE_NAME = "vault-org-keys-seed"
const idSchema = z.string().min(1).max(64)

const seedSchema = z.object({
    organizationId: idSchema,
    wrappedOrgVaultKey: z.string().min(1).max(4096),
})

class AlreadySeededError extends Error {}

export async function POST(request: Request) {
    const requestId = generateRequestId()
    try {
        const session = await getVaultSession()
        if (!session) {
            logVaultWarn(ROUTE_NAME, "Unauthorized org key seed", { requestId })
            return withNoStore(apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, requestId, 401))
        }

        const blocked = await enforceVaultRequestGuards({ request, requestId, identifier: session.user.id, route: ROUTE_NAME, csrf: true })
        if (blocked) return blocked

        const vaultSchema = await getVaultSchemaState()
        if (!vaultSchema.organizationMemberKeys) {
            return withNoStore(apiError(VAULT_SCHEMA_UNAVAILABLE_MESSAGE, ErrorCodes.SERVICE_UNAVAILABLE, requestId, 503))
        }

        const body = await request.json().catch(() => null)
        const validation = seedSchema.safeParse(body)
        if (!validation.success) {
            return withNoStore(apiError("Invalid request body", ErrorCodes.VALIDATION_ERROR, requestId, 400))
        }
        const { organizationId, wrappedOrgVaultKey } = validation.data

        // Only owner/admin may seed (they establish the team key).
        if (!(await isOrgManager(session.user.id, organizationId))) {
            return withNoStore(apiError("Insufficient organization role", ErrorCodes.FORBIDDEN, requestId, 403))
        }

        // Self-heal guard: if any member key already exists, the org is already
        // seeded and the org vault key has been distributed. A fresh seed here is
        // either a normal lost race OR the historical inconsistency where
        // `org_key_generation` lagged behind already-distributed keys (keys at
        // gen N while the org sat at 0). In BOTH cases we must NOT mint/overwrite a
        // second org vault key (that would split-brain members onto different
        // keys at the same generation). Instead, repair the org generation up to
        // the highest distributed key (never lowers it, won't fight a concurrent
        // rotation) and return 409 so the caller's client discards its freshly
        // generated key and re-fetches the real, already-distributed one. This is
        // what stops the prior bump-then-rollback loop that pinned the org at 0.
        const existingKey = await prisma.organizationMemberKey.findFirst({
            where: { organizationId },
            select: { orgKeyGeneration: true },
            orderBy: { orgKeyGeneration: "desc" },
        })
        if (existingKey) {
            const repaired = await prisma.organization.updateMany({
                where: { id: organizationId, orgKeyGeneration: { lt: existingKey.orgKeyGeneration } },
                data: { orgKeyGeneration: existingKey.orgKeyGeneration },
            })
            if (repaired.count > 0) {
                logVaultWarn(ROUTE_NAME, "Repaired lagging org key generation on seed", {
                    requestId,
                    data: { organizationId, generation: existingKey.orgKeyGeneration },
                })
            }
            return withNoStore(apiError("Team key already seeded", ErrorCodes.CONFLICT, requestId, 409))
        }

        try {
            await prisma.$transaction(async (tx) => {
                // Single-winner: only the transaction that flips 0 -> 1 proceeds.
                const bumped = await tx.organization.updateMany({
                    where: { id: organizationId, orgKeyGeneration: 0 },
                    data: { orgKeyGeneration: 1 },
                })
                if (bumped.count === 0) {
                    throw new AlreadySeededError()
                }
                await tx.organizationMemberKey.create({
                    data: { organizationId, userId: session.user.id, wrappedOrgVaultKey, orgKeyGeneration: 1 },
                })
            })
        } catch (error) {
            if (error instanceof AlreadySeededError) {
                return withNoStore(apiError("Team key already seeded", ErrorCodes.CONFLICT, requestId, 409))
            }
            // A unique-constraint race on the self-grant insert also means seeded.
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
                return withNoStore(apiError("Team key already seeded", ErrorCodes.CONFLICT, requestId, 409))
            }
            throw error
        }

        void audit({
            action: "org.vault.grant",
            actorId: session.user.id,
            targetId: session.user.id,
            organizationId,
            metadata: { orgKeyGeneration: 1, seed: true },
        })

        return withNoStore(apiSuccess({ organizationId, orgKeyGeneration: 1 }, requestId))
    } catch (error) {
        logVaultError(ROUTE_NAME, "Org key seed failed", error, { requestId })
        return withNoStore(apiError("Internal server error", ErrorCodes.INTERNAL_ERROR, requestId, 500))
    }
}
