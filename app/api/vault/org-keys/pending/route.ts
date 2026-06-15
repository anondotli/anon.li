import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { apiError, apiSuccess, ErrorCodes, generateRequestId, withNoStore } from "@/lib/api-response"
import { logVaultError, logVaultWarn } from "@/lib/vault/api"
import { getVaultSession } from "@/lib/vault/server"
import { getVaultSchemaState, VAULT_SCHEMA_UNAVAILABLE_MESSAGE } from "@/lib/vault/schema"
import { enforceVaultRequestGuards } from "@/lib/vault/http"
import { isOrgManager } from "@/lib/vault/org-access"

/**
 * Pending org-key grants (ORG-E2EE-DESIGN.md §5/§10.3).
 *
 * GET ?organizationId=… returns the members of an org who have published an
 * identity public key but have NOT yet been granted the org vault key — together
 * with their public keys, so an owner/admin's client can seal the org vault key
 * to each and POST the grants (the "reconcile" step). Owner/admin only: only they
 * grant. The "pending" set is simply derived (no queue table) — absence of an
 * OrganizationMemberKey row IS the pending state.
 */

const ROUTE_NAME = "vault-org-keys-pending"
const idSchema = z.string().min(1).max(64)

export async function GET(request: Request) {
    const requestId = generateRequestId()
    try {
        const session = await getVaultSession()
        if (!session) {
            logVaultWarn(ROUTE_NAME, "Unauthorized pending-grant lookup", { requestId })
            return withNoStore(apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, requestId, 401))
        }

        const blocked = await enforceVaultRequestGuards({ request, requestId, identifier: session.user.id, route: ROUTE_NAME })
        if (blocked) return blocked

        const vaultSchema = await getVaultSchemaState()
        if (!vaultSchema.userSecurity || !vaultSchema.organizationMemberKeys) {
            return withNoStore(apiError(VAULT_SCHEMA_UNAVAILABLE_MESSAGE, ErrorCodes.SERVICE_UNAVAILABLE, requestId, 503))
        }

        const organizationId = new URL(request.url).searchParams.get("organizationId")
        if (!idSchema.safeParse(organizationId).success) {
            return withNoStore(apiError("Invalid organizationId", ErrorCodes.VALIDATION_ERROR, requestId, 400))
        }

        // Only owner/admin may see the pending list (only they grant).
        if (!(await isOrgManager(session.user.id, organizationId!))) {
            return withNoStore(apiError("Insufficient organization role", ErrorCodes.FORBIDDEN, requestId, 403))
        }

        // Members who have published an identity public key…
        const [organization, members, granted] = await Promise.all([
            prisma.organization.findUnique({
                where: { id: organizationId! },
                select: { orgKeyGeneration: true },
            }),
            prisma.member.findMany({
                where: {
                    organizationId: organizationId!,
                    user: { security: { identityPublicKey: { not: null } } },
                },
                select: {
                    userId: true,
                    user: { select: { security: { select: { identityPublicKey: true } } } },
                },
            }),
            // …minus those who already hold a CURRENT-generation member key.
            prisma.organizationMemberKey.findMany({
                where: { organizationId: organizationId! },
                select: { userId: true, orgKeyGeneration: true },
            }),
        ])

        const currentGeneration = organization?.orgKeyGeneration ?? 0
        // A grant only counts as current if it is at the org's current generation.
        // A member holding a stale-generation key (e.g. they missed a rotation) is
        // therefore "pending" again and gets re-granted on the next reconcile.
        const currentGrantUserIds = new Set(
            granted.filter((g) => g.orgKeyGeneration >= currentGeneration).map((g) => g.userId),
        )
        const pending = members
            .filter((m) => !currentGrantUserIds.has(m.userId) && m.user.security?.identityPublicKey)
            .map((m) => ({ userId: m.userId, identityPublicKey: m.user.security!.identityPublicKey! }))

        // `seeded` is authoritative from the org generation (0 = unseeded). When
        // false an owner/admin with an unlocked vault should seed it (/seed).
        return withNoStore(apiSuccess({ pending, seeded: currentGeneration > 0, currentGeneration }, requestId))
    } catch (error) {
        logVaultError(ROUTE_NAME, "Pending-grant lookup failed", error, { requestId })
        return withNoStore(apiError("Internal server error", ErrorCodes.INTERNAL_ERROR, requestId, 500))
    }
}
