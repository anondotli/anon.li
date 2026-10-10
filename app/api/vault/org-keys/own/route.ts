import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { apiError, apiSuccess, ErrorCodes, generateRequestId, withNoStore } from "@/lib/api-response"
import { logVaultError, logVaultWarn } from "@/lib/vault/api"
import { getVaultSession } from "@/lib/vault/server"
import { enforceVaultRequestGuards } from "@/lib/vault/http"
import { assertOrgVaultAccess } from "@/lib/vault/org-access"
import { CIPHERTEXT_HASH_PATTERN, hashCiphertext } from "@/lib/vault/ciphertext-hash"

/**
 * DELETE ?organizationId=…&orgKeyGeneration=…&wrappedKeyHash=… releases the
 * CALLER's own OrganizationMemberKey for that org — the self-heal path for a
 * grant the member's client can no longer unseal (e.g. it was sealed to an
 * identity key that has since been replaced). With the row gone the member
 * shows up as "pending" again and the next owner/admin reconcile re-grants the
 * org vault key to their current identity.
 *
 * Safety:
 * - Only ever touches the caller's own row: the userId comes from the session.
 * - Compare-and-delete: the client names the exact grant it failed to open
 *   (generation + SHA-256 of the sealed key). If the row has changed since (an
 *   admin re-granted in the meantime) nothing is deleted (409 CONFLICT).
 * - Never deletes the LAST current-generation grant of the org: if nobody else
 *   holds the current key, deleting this row can only make things worse, so it
 *   is kept and the client tells the user to contact support (409
 *   ORG_KEY_LAST_HOLDER).
 */

const ROUTE_NAME = "vault-org-keys-own"
const releaseQuerySchema = z.object({
    organizationId: z.string().min(1).max(64),
    orgKeyGeneration: z.coerce.number().int().positive(),
    wrappedKeyHash: z.string().regex(CIPHERTEXT_HASH_PATTERN),
})

export async function DELETE(request: Request) {
    const requestId = generateRequestId()
    try {
        const session = await getVaultSession()
        if (!session) {
            logVaultWarn(ROUTE_NAME, "Unauthorized own member key release", { requestId })
            return withNoStore(apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, requestId, 401))
        }

        const blocked = await enforceVaultRequestGuards({
            request,
            requestId,
            identifier: session.user.id,
            route: ROUTE_NAME,
            csrf: true,
        })
        if (blocked) return blocked

        const params = new URL(request.url).searchParams
        const query = releaseQuerySchema.safeParse({
            organizationId: params.get("organizationId") ?? undefined,
            orgKeyGeneration: params.get("orgKeyGeneration") ?? undefined,
            wrappedKeyHash: params.get("wrappedKeyHash") ?? undefined,
        })
        if (!query.success) {
            return withNoStore(apiError("Invalid request", ErrorCodes.VALIDATION_ERROR, requestId, 400))
        }
        const { organizationId, orgKeyGeneration, wrappedKeyHash } = query.data
        const userId = session.user.id

        const policyBlocked = await assertOrgVaultAccess({ user: session.user, organizationId, requestId })
        if (policyBlocked) return policyBlocked

        const grant = await prisma.organizationMemberKey.findUnique({
            where: { organizationId_userId: { organizationId, userId } },
            select: { wrappedOrgVaultKey: true, orgKeyGeneration: true },
        })
        if (!grant) {
            return withNoStore(apiSuccess({ organizationId, released: 0 }, requestId))
        }

        if (
            grant.orgKeyGeneration !== orgKeyGeneration
            || (await hashCiphertext(grant.wrappedOrgVaultKey)) !== wrappedKeyHash
        ) {
            return withNoStore(apiError("Your team key grant has changed; reload and try again", ErrorCodes.CONFLICT, requestId, 409))
        }

        const organization = await prisma.organization.findUnique({
            where: { id: organizationId },
            select: { orgKeyGeneration: true },
        })
        const currentGeneration = organization?.orgKeyGeneration ?? 0
        if (currentGeneration > 0 && grant.orgKeyGeneration >= currentGeneration) {
            const otherHolders = await prisma.organizationMemberKey.count({
                where: { organizationId, userId: { not: userId }, orgKeyGeneration: { gte: currentGeneration } },
            })
            if (otherHolders === 0) {
                logVaultWarn(ROUTE_NAME, "Refused to release the last current org key grant", {
                    requestId,
                    userId,
                    data: { organizationId, orgKeyGeneration },
                })
                return withNoStore(apiError(
                    "No other team member holds the current team key, so it was not released. Contact support.",
                    ErrorCodes.ORG_KEY_LAST_HOLDER,
                    requestId,
                    409,
                ))
            }
        }

        // Conditional on the exact row we verified, so a concurrent re-grant is
        // never deleted.
        const result = await prisma.organizationMemberKey.deleteMany({
            where: {
                organizationId,
                userId,
                orgKeyGeneration: grant.orgKeyGeneration,
                wrappedOrgVaultKey: grant.wrappedOrgVaultKey,
            },
        })

        logVaultWarn(ROUTE_NAME, "Member released an unopenable org key grant", {
            requestId,
            userId,
            data: { organizationId, orgKeyGeneration, deleted: result.count },
        })

        return withNoStore(apiSuccess({ organizationId, released: result.count }, requestId))
    } catch (error) {
        logVaultError(ROUTE_NAME, "Own member key release failed", error, { requestId })
        return withNoStore(apiError("Internal server error", ErrorCodes.INTERNAL_ERROR, requestId, 500))
    }
}
