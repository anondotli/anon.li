import { prisma } from "@/lib/prisma"
import { apiError, apiSuccess, ErrorCodes, generateRequestId, withNoStore } from "@/lib/api-response"
import {
    getCredentialAccount,
    getVaultSession,
    hashCredentialSecret,
    verifyCredentialSecret,
    VAULT_KDF_VERSION,
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

const ROUTE_NAME = "setup"

const setupSchema = z.object({
    currentPassword: z.string().min(12).optional(),
    authSecret: authSecretSchema,
    authSalt: authSaltSchema,
    vaultSalt: vaultSaltSchema,
    passwordWrappedVaultKey: wrappedVaultKeySchema,
})

export async function POST(request: Request) {
    const requestId = generateRequestId()
    try {
        // Get session without 2FA requirement first, then check conditionally
        const session = await getVaultSession({ require2FA: false })

        if (!session) {
            logVaultWarn(ROUTE_NAME, "Unauthorized vault setup attempt", { requestId })
            return withNoStore(apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, requestId, 401))
        }

        // If the user has 2FA enabled, they must have verified it before setting up the vault
        if (session.user.twoFactorEnabled && !session.session.twoFactorVerified) {
            logVaultWarn(ROUTE_NAME, "Vault setup blocked pending 2FA verification", {
                requestId,
                userId: session.user.id,
            })
            return withNoStore(apiError("Two-factor authentication required", ErrorCodes.UNAUTHORIZED, requestId, 401))
        }

        const blocked = await enforceVaultRequestGuards({
            request,
            requestId,
            identifier: session.user.id,
            route: ROUTE_NAME,
            csrf: true,
            rateLimitKey: "vaultSetup",
        })
        if (blocked) return blocked

        const vaultSchema = await getVaultSchemaState()
        if (!vaultSchema.userSecurity) {
            logVaultError(ROUTE_NAME, "Vault schema unavailable during setup", undefined, {
                requestId,
                userId: session.user.id,
            })
            return withNoStore(apiError(VAULT_SCHEMA_UNAVAILABLE_MESSAGE, ErrorCodes.SERVICE_UNAVAILABLE, requestId, 503))
        }

        const body = await request.json().catch(() => null)
        const validation = setupSchema.safeParse(body)

        if (!validation.success) {
            logVaultWarn(ROUTE_NAME, "Invalid vault setup payload", {
                requestId,
                userId: session.user.id,
            })
            return withNoStore(apiError("Invalid request body", ErrorCodes.VALIDATION_ERROR, requestId, 400))
        }

        const existingSecurity = await prisma.userSecurity.findUnique({
            where: { userId: session.user.id },
            select: { id: true },
        })

        if (existingSecurity) {
            logVaultWarn(ROUTE_NAME, "Vault setup attempted after configuration already exists", {
                requestId,
                userId: session.user.id,
            })
            return withNoStore(apiError("Vault security is already configured", ErrorCodes.CONFLICT, requestId, 409))
        }

        const credentialAccount = await getCredentialAccount(session.user.id)
        const passwordHash = await hashCredentialSecret(validation.data.authSecret)

        let createdSecurity: { id: string; vaultGeneration: number }

        if (validation.data.currentPassword) {
            // Upgrading an existing credential account to vault
            if (!credentialAccount?.password) {
                logVaultWarn(ROUTE_NAME, "Vault setup upgrade attempted without credential account", {
                    requestId,
                    userId: session.user.id,
                })
                return withNoStore(apiError("Password login is not configured for this account", ErrorCodes.CONFLICT, requestId, 409))
            }

            const passwordValid = await verifyCredentialSecret(session.user.id, validation.data.currentPassword)
            if (!passwordValid) {
                logVaultWarn(ROUTE_NAME, "Vault setup rejected due to incorrect current password", {
                    requestId,
                    userId: session.user.id,
                })
                return withNoStore(apiError("Incorrect password", ErrorCodes.UNAUTHORIZED, requestId, 401))
            }

            createdSecurity = await prisma.$transaction(async (tx) => {
                await tx.account.update({
                    where: { id: credentialAccount.id },
                    data: { password: passwordHash },
                })
                return tx.userSecurity.create({
                    data: {
                        userId: session.user.id,
                        authSalt: validation.data.authSalt,
                        vaultSalt: validation.data.vaultSalt,
                        passwordWrappedVaultKey: validation.data.passwordWrappedVaultKey,
                        kdfVersion: VAULT_KDF_VERSION,
                        migrationState: "complete",
                    },
                    select: { id: true, vaultGeneration: true },
                })
            })
        } else {
            // Creating a new credential account + vault (social-only user)
            if (credentialAccount) {
                logVaultWarn(ROUTE_NAME, "Vault setup attempted with an existing credential account", {
                    requestId,
                    userId: session.user.id,
                })
                return withNoStore(apiError("Password login already exists for this account", ErrorCodes.CONFLICT, requestId, 409))
            }

            createdSecurity = await prisma.$transaction(async (tx) => {
                await tx.account.create({
                    data: {
                        userId: session.user.id,
                        accountId: session.user.id,
                        providerId: "credential",
                        password: passwordHash,
                    },
                })
                return tx.userSecurity.create({
                    data: {
                        userId: session.user.id,
                        authSalt: validation.data.authSalt,
                        vaultSalt: validation.data.vaultSalt,
                        passwordWrappedVaultKey: validation.data.passwordWrappedVaultKey,
                        kdfVersion: VAULT_KDF_VERSION,
                        migrationState: "complete",
                    },
                    select: { id: true, vaultGeneration: true },
                })
            })
        }

        return withNoStore(apiSuccess({
            ok: true,
            vaultId: createdSecurity.id,
            vaultGeneration: createdSecurity.vaultGeneration,
        }, requestId))
    } catch (error) {
        logVaultError(ROUTE_NAME, "Vault setup failed", error, { requestId })
        return withNoStore(apiError("Internal server error", ErrorCodes.INTERNAL_ERROR, requestId, 500))
    }
}
