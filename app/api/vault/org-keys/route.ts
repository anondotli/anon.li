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
 * Org shared-E2EE member keys (ORG-E2EE-DESIGN.md §3b/§5).
 *
 * GET ?organizationId=… returns the CALLER's own OrganizationMemberKey (the org
 * vault key sealed to their identity public key) so their client can recover the
 * org vault key. Any member of the org may read their own.
 *
 * POST grants: an owner/admin's client, having sealed the org vault key to a
 * target member's identity public key, stores the resulting OrganizationMemberKey.
 * Only owner/admin may grant (decision §10.5), and only to an existing member.
 * The server stores/serves opaque ciphertext — it never sees the org vault key.
 */

const ROUTE_NAME = "vault-org-keys"
const idSchema = z.string().min(1).max(64)

const grantSchema = z.object({
    organizationId: idSchema,
    targetUserId: idSchema,
    wrappedOrgVaultKey: z.string().min(1).max(4096),
    orgKeyGeneration: z.number().int().positive(),
})

export async function GET(request: Request) {
    const requestId = generateRequestId()
    try {
        const session = await getVaultSession()
        if (!session) {
            logVaultWarn(ROUTE_NAME, "Unauthorized org member key lookup", { requestId })
            return withNoStore(apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, requestId, 401))
        }

        const blocked = await enforceVaultRequestGuards({ request, requestId, identifier: session.user.id, route: ROUTE_NAME })
        if (blocked) return blocked

        const vaultSchema = await getVaultSchemaState()
        if (!vaultSchema.organizationMemberKeys) {
            return withNoStore(apiError(VAULT_SCHEMA_UNAVAILABLE_MESSAGE, ErrorCodes.SERVICE_UNAVAILABLE, requestId, 503))
        }

        const organizationId = new URL(request.url).searchParams.get("organizationId")
        if (!organizationId || !idSchema.safeParse(organizationId).success) {
            return withNoStore(apiError("Invalid organizationId", ErrorCodes.VALIDATION_ERROR, requestId, 400))
        }

        // Must be a member of the org to read your own key for it.
        const [membership, organization, memberKey] = await Promise.all([
            prisma.member.findUnique({
                where: { organizationId_userId: { organizationId: organizationId, userId: session.user.id } },
                select: { role: true },
            }),
            prisma.organization.findUnique({
                where: { id: organizationId },
                select: { orgKeyGeneration: true },
            }),
            prisma.organizationMemberKey.findUnique({
                where: { organizationId_userId: { organizationId: organizationId, userId: session.user.id } },
                select: { wrappedOrgVaultKey: true, orgKeyGeneration: true },
            }),
        ])
        if (!membership) {
            return withNoStore(apiError("Not a member of this organization", ErrorCodes.FORBIDDEN, requestId, 403))
        }

        // `currentGeneration` is the org's authoritative org-vault-key generation
        // (0 = unseeded). The client compares it to `memberKey.orgKeyGeneration` to
        // detect a stale grant (e.g. after a rotation the member missed). null
        // memberKey = member exists but hasn't been granted the org vault key yet.
        return withNoStore(apiSuccess({
            memberKey,
            currentGeneration: organization?.orgKeyGeneration ?? 0,
        }, requestId))
    } catch (error) {
        logVaultError(ROUTE_NAME, "Org member key lookup failed", error, { requestId })
        return withNoStore(apiError("Internal server error", ErrorCodes.INTERNAL_ERROR, requestId, 500))
    }
}

export async function POST(request: Request) {
    const requestId = generateRequestId()
    try {
        const session = await getVaultSession()
        if (!session) {
            logVaultWarn(ROUTE_NAME, "Unauthorized org member key grant", { requestId })
            return withNoStore(apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, requestId, 401))
        }

        const blocked = await enforceVaultRequestGuards({ request, requestId, identifier: session.user.id, route: ROUTE_NAME, csrf: true })
        if (blocked) return blocked

        const vaultSchema = await getVaultSchemaState()
        if (!vaultSchema.organizationMemberKeys) {
            return withNoStore(apiError(VAULT_SCHEMA_UNAVAILABLE_MESSAGE, ErrorCodes.SERVICE_UNAVAILABLE, requestId, 503))
        }

        const body = await request.json().catch(() => null)
        const validation = grantSchema.safeParse(body)
        if (!validation.success) {
            logVaultWarn(ROUTE_NAME, "Invalid org key grant payload", { requestId, userId: session.user.id })
            return withNoStore(apiError("Invalid request body", ErrorCodes.VALIDATION_ERROR, requestId, 400))
        }
        const { organizationId, targetUserId, wrappedOrgVaultKey, orgKeyGeneration } = validation.data

        // Caller must be owner/admin of the org to grant (decision §10.5).
        if (!(await isOrgManager(session.user.id, organizationId))) {
            return withNoStore(apiError("Insufficient organization role", ErrorCodes.FORBIDDEN, requestId, 403))
        }

        // The grantee must already be a member of the org.
        const grantee = await prisma.member.findUnique({
            where: { organizationId_userId: { organizationId, userId: targetUserId } },
            select: { id: true },
        })
        if (!grantee) {
            return withNoStore(apiError("Target is not a member of this organization", ErrorCodes.NOT_FOUND, requestId, 404))
        }

        // Server-authoritative generation: a grant must be sealed to the org's
        // CURRENT org-vault-key generation. Reject stale/forged generations so a
        // caller with a stale cached key can't record a grant nobody can use
        // (the client should re-fetch the current generation and retry). The org
        // must already be seeded (gen >= 1); gen-1 seeding goes via /seed.
        const org = await prisma.organization.findUnique({
            where: { id: organizationId },
            select: { orgKeyGeneration: true },
        })
        if (!org || org.orgKeyGeneration < 1) {
            return withNoStore(apiError("Organization team key is not seeded yet", ErrorCodes.CONFLICT, requestId, 409))
        }
        if (orgKeyGeneration !== org.orgKeyGeneration) {
            return withNoStore(apiError("Stale org key generation; refresh and retry", ErrorCodes.CONFLICT, requestId, 409))
        }

        await prisma.organizationMemberKey.upsert({
            where: { organizationId_userId: { organizationId, userId: targetUserId } },
            create: { organizationId, userId: targetUserId, wrappedOrgVaultKey, orgKeyGeneration },
            update: { wrappedOrgVaultKey, orgKeyGeneration },
        })

        // Org audit trail: who granted the team vault key to whom (fire-and-forget).
        void audit({
            action: "org.vault.grant",
            actorId: session.user.id,
            targetId: targetUserId,
            organizationId,
            metadata: { orgKeyGeneration },
        })

        return withNoStore(apiSuccess({ organizationId, userId: targetUserId, orgKeyGeneration }, requestId))
    } catch (error) {
        logVaultError(ROUTE_NAME, "Org member key grant failed", error, { requestId })
        return withNoStore(apiError("Internal server error", ErrorCodes.INTERNAL_ERROR, requestId, 500))
    }
}
