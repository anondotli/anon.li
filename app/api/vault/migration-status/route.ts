import { prisma } from "@/lib/prisma"
import { apiError, apiSuccess, ErrorCodes, generateRequestId, withNoStore } from "@/lib/api-response"
import { logVaultError, logVaultWarn } from "@/lib/vault/api"
import { getCredentialAccount, getVaultSession } from "@/lib/vault/server"
import { getVaultSchemaState } from "@/lib/vault/schema"
import { enforceVaultRequestGuards } from "@/lib/vault/http"

const ROUTE_NAME = "migration-status"

export async function GET() {
    const requestId = generateRequestId()
    try {
        const session = await getVaultSession({ require2FA: false })

        if (!session) {
            logVaultWarn(ROUTE_NAME, "Unauthorized vault migration status request", { requestId })
            return withNoStore(apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, requestId, 401))
        }

        const blocked = await enforceVaultRequestGuards({
            requestId,
            identifier: session.user.id,
            route: ROUTE_NAME,
        })
        if (blocked) return blocked

        const vaultSchema = await getVaultSchemaState()
        const credentialAccount = await getCredentialAccount(session.user.id)

        if (!vaultSchema.userSecurity) {
            return withNoStore(apiSuccess({
                vaultAvailable: false,
                needsPassword: false,
                hasPassword: Boolean(credentialAccount),
                hasVault: false,
                migrationState: "unavailable",
                vaultId: null,
                vaultGeneration: null,
            }, requestId))
        }

        const security = await prisma.userSecurity.findUnique({
            where: { userId: session.user.id },
            select: {
                id: true,
                migrationState: true,
                vaultGeneration: true,
            },
        })

        return withNoStore(apiSuccess({
            vaultAvailable: true,
            needsPassword: !security,
            hasPassword: Boolean(credentialAccount),
            hasVault: Boolean(security),
            migrationState: security?.migrationState ?? "pending",
            vaultId: security?.id ?? null,
            vaultGeneration: security?.vaultGeneration ?? null,
        }, requestId))
    } catch (error) {
        logVaultError(ROUTE_NAME, "Vault migration status request failed", error, { requestId })
        return withNoStore(apiError("Internal server error", ErrorCodes.INTERNAL_ERROR, requestId, 500))
    }
}
