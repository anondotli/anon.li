import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { apiError, apiSuccess, ErrorCodes, generateRequestId, withNoStore } from "@/lib/api-response"
import { logVaultError, logVaultWarn } from "@/lib/vault/api"
import { getVaultSession } from "@/lib/vault/server"
import { getVaultSchemaState, VAULT_SCHEMA_UNAVAILABLE_MESSAGE } from "@/lib/vault/schema"
import { enforceVaultRequestGuards } from "@/lib/vault/http"
import {
    identityPublicKeySchema,
    vaultGenerationSchema,
    vaultIdSchema,
    wrappedIdentityPrivateKeySchema,
} from "@/lib/vault/validation"

/**
 * User identity keypair for org shared-E2EE (ORG-E2EE-DESIGN.md §3a).
 *
 * POST publishes the caller's own identity keypair (public key plaintext +
 * private key wrapped to their vault key), bound to the current vault identity.
 * GET returns the caller's own stored material so the client can recover the
 * private key after unlock. The server only stores/serves ciphertext + the
 * public key — never a plaintext private key. Cross-member public-key fetch (for
 * an admin granting the org key) is a separate, org-scoped endpoint added with
 * the grant flow.
 */

const publishIdentitySchema = z.object({
    identityPublicKey: identityPublicKeySchema,
    wrappedIdentityPrivateKey: wrappedIdentityPrivateKeySchema,
    vaultId: vaultIdSchema,
    vaultGeneration: vaultGenerationSchema,
})
const ROUTE_NAME = "vault-identity"

export async function GET(request: Request) {
    const requestId = generateRequestId()
    try {
        const session = await getVaultSession()
        if (!session) {
            logVaultWarn(ROUTE_NAME, "Unauthorized identity key lookup", { requestId })
            return withNoStore(apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, requestId, 401))
        }

        const blocked = await enforceVaultRequestGuards({
            request,
            requestId,
            identifier: session.user.id,
            route: ROUTE_NAME,
        })
        if (blocked) return blocked

        const vaultSchema = await getVaultSchemaState()
        if (!vaultSchema.userSecurity) {
            logVaultError(ROUTE_NAME, "Vault schema unavailable during identity key lookup", undefined, {
                requestId,
                userId: session.user.id,
            })
            return withNoStore(apiError(VAULT_SCHEMA_UNAVAILABLE_MESSAGE, ErrorCodes.SERVICE_UNAVAILABLE, requestId, 503))
        }

        const security = await prisma.userSecurity.findUnique({
            where: { userId: session.user.id },
            select: {
                identityPublicKey: true,
                wrappedIdentityPrivateKey: true,
                identityKeyGeneration: true,
            },
        })

        if (!security) {
            return withNoStore(apiError("Vault security is not configured", ErrorCodes.NOT_FOUND, requestId, 404))
        }

        // identity* fields are null until the user has provisioned a keypair;
        // the client treats null as "needs provisioning".
        return withNoStore(apiSuccess(security, requestId))
    } catch (error) {
        logVaultError(ROUTE_NAME, "Identity key lookup failed", error, { requestId })
        return withNoStore(apiError("Internal server error", ErrorCodes.INTERNAL_ERROR, requestId, 500))
    }
}

export async function POST(request: Request) {
    const requestId = generateRequestId()
    try {
        const session = await getVaultSession()
        if (!session) {
            logVaultWarn(ROUTE_NAME, "Unauthorized identity key publish attempt", { requestId })
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

        const vaultSchema = await getVaultSchemaState()
        if (!vaultSchema.userSecurity) {
            logVaultError(ROUTE_NAME, "Vault schema unavailable during identity key publish", undefined, {
                requestId,
                userId: session.user.id,
            })
            return withNoStore(apiError(VAULT_SCHEMA_UNAVAILABLE_MESSAGE, ErrorCodes.SERVICE_UNAVAILABLE, requestId, 503))
        }

        const body = await request.json().catch(() => null)
        const validation = publishIdentitySchema.safeParse(body)
        if (!validation.success) {
            logVaultWarn(ROUTE_NAME, "Invalid identity key payload", { requestId, userId: session.user.id })
            return withNoStore(apiError("Invalid request body", ErrorCodes.VALIDATION_ERROR, requestId, 400))
        }

        const security = await prisma.userSecurity.findUnique({
            where: { userId: session.user.id },
            select: { id: true, vaultGeneration: true },
        })

        if (!security) {
            logVaultWarn(ROUTE_NAME, "Identity key publish without configured vault security", {
                requestId,
                userId: session.user.id,
            })
            return withNoStore(apiError("Vault security is not configured", ErrorCodes.NOT_FOUND, requestId, 404))
        }

        if (validation.data.vaultId !== security.id) {
            return withNoStore(apiError("Vault identity mismatch", ErrorCodes.CONFLICT, requestId, 409))
        }

        if (validation.data.vaultGeneration !== security.vaultGeneration) {
            return withNoStore(apiError("Vault generation mismatch", ErrorCodes.CONFLICT, requestId, 409))
        }

        await prisma.userSecurity.update({
            where: { userId: session.user.id },
            data: {
                identityPublicKey: validation.data.identityPublicKey,
                wrappedIdentityPrivateKey: validation.data.wrappedIdentityPrivateKey,
                identityKeyGeneration: validation.data.vaultGeneration,
            },
        })

        return withNoStore(apiSuccess({
            identityPublicKey: validation.data.identityPublicKey,
            identityKeyGeneration: validation.data.vaultGeneration,
        }, requestId))
    } catch (error) {
        logVaultError(ROUTE_NAME, "Identity key publish failed", error, { requestId })
        return withNoStore(apiError("Internal server error", ErrorCodes.INTERNAL_ERROR, requestId, 500))
    }
}
