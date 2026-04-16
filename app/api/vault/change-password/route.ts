import { prisma } from "@/lib/prisma"
import { apiError, apiSuccess, ErrorCodes, generateRequestId, withNoStore } from "@/lib/api-response"
import {
    getCredentialAccount,
    getVaultSession,
    hashCredentialSecret,
    verifyCredentialSecret,
} from "@/lib/vault/server"
import { logVaultError, logVaultWarn } from "@/lib/vault/api"
import { getVaultSchemaState, VAULT_SCHEMA_UNAVAILABLE_MESSAGE } from "@/lib/vault/schema"
import { enforceVaultRequestGuards } from "@/lib/vault/http"
import {
    authSaltSchema,
    authSecretSchema,
    vaultSaltSchema,
    wrappedVaultKeySchema,
} from "@/lib/vault/validation"
import { z } from "zod"

const ROUTE_NAME = "change-password"

const changePasswordSchema = z.object({
    currentAuthSecret: authSecretSchema,
    newAuthSecret: authSecretSchema,
    newAuthSalt: authSaltSchema,
    newVaultSalt: vaultSaltSchema,
    newPasswordWrappedVaultKey: wrappedVaultKeySchema,
    revokeOtherSessions: z.boolean().default(true),
})

export async function POST(request: Request) {
    const requestId = generateRequestId()
    try {
        const session = await getVaultSession({ require2FA: true, fresh: true })

        if (!session) {
            logVaultWarn(ROUTE_NAME, "Vault password change requires a fresh session", { requestId })
            return withNoStore(apiError("A fresh authenticated session is required", ErrorCodes.UNAUTHORIZED, requestId, 401))
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
            logVaultError(ROUTE_NAME, "Vault schema unavailable during password change", undefined, {
                requestId,
                userId: session.user.id,
            })
            return withNoStore(apiError(VAULT_SCHEMA_UNAVAILABLE_MESSAGE, ErrorCodes.SERVICE_UNAVAILABLE, requestId, 503))
        }

        const body = await request.json().catch(() => null)
        const validation = changePasswordSchema.safeParse(body)

        if (!validation.success) {
            logVaultWarn(ROUTE_NAME, "Invalid vault password change payload", {
                requestId,
                userId: session.user.id,
            })
            return withNoStore(apiError("Invalid request body", ErrorCodes.VALIDATION_ERROR, requestId, 400))
        }

        const [security, credentialAccount] = await Promise.all([
            prisma.userSecurity.findUnique({
                where: { userId: session.user.id },
                select: {
                    id: true,
                },
            }),
            getCredentialAccount(session.user.id),
        ])

        if (!security || !credentialAccount?.password) {
            logVaultWarn(ROUTE_NAME, "Vault password change attempted without configured vault security", {
                requestId,
                userId: session.user.id,
            })
            return withNoStore(apiError("Vault security is not configured", ErrorCodes.NOT_FOUND, requestId, 404))
        }

        const currentSecretValid = await verifyCredentialSecret(session.user.id, validation.data.currentAuthSecret)
        if (!currentSecretValid) {
            logVaultWarn(ROUTE_NAME, "Vault password change rejected due to incorrect password", {
                requestId,
                userId: session.user.id,
            })
            return withNoStore(apiError("Incorrect password", ErrorCodes.UNAUTHORIZED, requestId, 401))
        }

        const passwordHash = await hashCredentialSecret(validation.data.newAuthSecret)

        const updatedSecurity = await prisma.$transaction(async (tx) => {
            await tx.account.update({
                where: { id: credentialAccount.id },
                data: {
                    password: passwordHash,
                },
            })

            const updated = await tx.userSecurity.update({
                where: { userId: session.user.id },
                data: {
                    authSalt: validation.data.newAuthSalt,
                    vaultSalt: validation.data.newVaultSalt,
                    passwordWrappedVaultKey: validation.data.newPasswordWrappedVaultKey,
                    passwordSetAt: new Date(),
                    migrationState: "complete",
                    vaultGeneration: { increment: 1 },
                },
                select: { id: true, vaultGeneration: true },
            })

            if (validation.data.revokeOtherSessions) {
                await tx.session.deleteMany({
                    where: {
                        userId: session.user.id,
                        id: { not: session.session.id },
                    },
                })
            }

            return updated
        })

        return withNoStore(apiSuccess({
            vaultId: updatedSecurity.id,
            vaultGeneration: updatedSecurity.vaultGeneration,
        }, requestId))
    } catch (error) {
        logVaultError(ROUTE_NAME, "Vault password change failed", error, { requestId })
        return withNoStore(apiError("Internal server error", ErrorCodes.INTERNAL_ERROR, requestId, 500))
    }
}
