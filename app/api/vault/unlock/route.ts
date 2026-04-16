import { prisma } from "@/lib/prisma"
import { apiError, apiSuccess, ErrorCodes, generateRequestId, withNoStore } from "@/lib/api-response"
import { logVaultError, logVaultWarn } from "@/lib/vault/api"
import { getVaultSession } from "@/lib/vault/server"
import { getVaultSchemaState, VAULT_SCHEMA_UNAVAILABLE_MESSAGE } from "@/lib/vault/schema"
import { enforceVaultRequestGuards } from "@/lib/vault/http"

const ROUTE_NAME = "unlock-materials"

export async function GET() {
    const requestId = generateRequestId()
    try {
        const session = await getVaultSession({ require2FA: true })

        if (!session) {
            logVaultWarn(ROUTE_NAME, "Unauthorized unlock materials request", { requestId })
            return withNoStore(apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, requestId, 401))
        }

        const blocked = await enforceVaultRequestGuards({
            requestId,
            identifier: session.user.id,
            route: ROUTE_NAME,
        })
        if (blocked) return blocked

        const vaultSchema = await getVaultSchemaState()
        if (!vaultSchema.userSecurity) {
            logVaultError(ROUTE_NAME, "Vault schema unavailable during unlock", undefined, {
                requestId,
                userId: session.user.id,
            })
            return withNoStore(apiError(VAULT_SCHEMA_UNAVAILABLE_MESSAGE, ErrorCodes.SERVICE_UNAVAILABLE, requestId, 503))
        }

        const security = await prisma.userSecurity.findUnique({
            where: { userId: session.user.id },
            select: {
                id: true,
                authSalt: true,
                vaultSalt: true,
                passwordWrappedVaultKey: true,
                vaultGeneration: true,
                kdfVersion: true,
            },
        })

        if (!security) {
            logVaultWarn(ROUTE_NAME, "Unlock materials requested before vault setup", {
                requestId,
                userId: session.user.id,
            })
            return withNoStore(apiError("Vault security is not configured", ErrorCodes.NOT_FOUND, requestId, 404))
        }

        return withNoStore(apiSuccess({
            vaultId: security.id,
            authSalt: security.authSalt,
            vaultSalt: security.vaultSalt,
            passwordWrappedVaultKey: security.passwordWrappedVaultKey,
            vaultGeneration: security.vaultGeneration,
            kdfVersion: security.kdfVersion,
        }, requestId))
    } catch (error) {
        logVaultError(ROUTE_NAME, "Unlock materials request failed", error, { requestId })
        return withNoStore(apiError("Internal server error", ErrorCodes.INTERNAL_ERROR, requestId, 500))
    }
}
