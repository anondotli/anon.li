import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { apiError, apiSuccess, ErrorCodes, generateRequestId, withNoStore } from "@/lib/api-response"
import { logVaultError, logVaultWarn } from "@/lib/vault/api"
import { getVaultSession } from "@/lib/vault/server"
import { getVaultSchemaState, VAULT_SCHEMA_UNAVAILABLE_MESSAGE } from "@/lib/vault/schema"
import { enforceVaultRequestGuards } from "@/lib/vault/http"
import { isOrgManager } from "@/lib/vault/org-access"

/**
 * All members of an org who have published an identity public key, WITH their
 * keys — the re-grant targets for a key rotation (ORG-E2EE-DESIGN §6). Unlike
 * the pending endpoint, this includes already-granted members (rotation seals
 * the NEW key to everyone). Owner/admin only.
 */

const ROUTE_NAME = "vault-org-keys-members"
const idSchema = z.string().min(1).max(64)

export async function GET(request: Request) {
    const requestId = generateRequestId()
    try {
        const session = await getVaultSession()
        if (!session) {
            logVaultWarn(ROUTE_NAME, "Unauthorized member-key listing", { requestId })
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

        if (!(await isOrgManager(session.user.id, organizationId!))) {
            return withNoStore(apiError("Insufficient organization role", ErrorCodes.FORBIDDEN, requestId, 403))
        }

        const members = await prisma.member.findMany({
            where: {
                organizationId: organizationId!,
                user: { security: { identityPublicKey: { not: null } } },
            },
            select: {
                userId: true,
                user: { select: { security: { select: { identityPublicKey: true } } } },
            },
        })

        const result = members
            .filter((m) => m.user.security?.identityPublicKey)
            .map((m) => ({ userId: m.userId, identityPublicKey: m.user.security!.identityPublicKey! }))

        return withNoStore(apiSuccess({ members: result }, requestId))
    } catch (error) {
        logVaultError(ROUTE_NAME, "Member-key listing failed", error, { requestId })
        return withNoStore(apiError("Internal server error", ErrorCodes.INTERNAL_ERROR, requestId, 500))
    }
}
