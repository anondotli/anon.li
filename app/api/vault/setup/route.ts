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
    // This verifies an existing credential and may predate the current 12-char
    // policy. Enforce the stronger policy on the new vault password, not here.
    currentPassword: z.string().min(1).optional(),
    authSecret: authSecretSchema,
    authSalt: authSaltSchema,
    vaultSalt: vaultSaltSchema,
    passwordWrappedVaultKey: wrappedVaultKeySchema,
})

export async function POST(request: Request) {
    const requestId = generateRequestId()
    try {
        // Get a fresh session without 2FA requirement first, then check conditionally.
        const session = await getVaultSession({ require2FA: false, fresh: true })

        if (!session) {
            logVaultWarn(ROUTE_NAME, "Vault setup requires a fresh session", { requestId })
            return withNoStore(apiError("A fresh authenticated session is required", ErrorCodes.UNAUTHORIZED, requestId, 401))
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

        if (credentialAccount?.password) {
            if (!validation.data.currentPassword) {
                logVaultWarn(ROUTE_NAME, "Vault setup rejected without current password", {
                    requestId,
                    userId: session.user.id,
                })
                return withNoStore(apiError("Current password is required", ErrorCodes.UNAUTHORIZED, requestId, 401))
            }

            const passwordValid = await verifyCredentialSecret(
                session.user.id,
                validation.data.currentPassword,
            )
            if (!passwordValid) {
                logVaultWarn(ROUTE_NAME, "Vault setup rejected due to incorrect current password", {
                    requestId,
                    userId: session.user.id,
                })
                return withNoStore(apiError("Incorrect password", ErrorCodes.UNAUTHORIZED, requestId, 401))
            }
        } else if (validation.data.currentPassword) {
            logVaultWarn(ROUTE_NAME, "Vault setup upgrade attempted without credential account", {
                requestId,
                userId: session.user.id,
            })
            return withNoStore(apiError("Password login is not configured for this account", ErrorCodes.CONFLICT, requestId, 409))
        }

        const passwordHash = await hashCredentialSecret(validation.data.authSecret)
        const createdSecurity = await prisma.$transaction(async (tx) => {
            if (credentialAccount) {
                await tx.account.update({
                    where: { id: credentialAccount.id },
                    data: { password: passwordHash },
                })
            } else {
                await tx.account.create({
                    data: {
                        userId: session.user.id,
                        accountId: session.user.id,
                        providerId: "credential",
                        password: passwordHash,
                    },
                })
            }

            return tx.userSecurity.create({
                data: {
                    userId: session.user.id,
                    authSalt: validation.data.authSalt,
                    vaultSalt: validation.data.vaultSalt,
                    passwordWrappedVaultKey: validation.data.passwordWrappedVaultKey,
                    kdfVersion: VAULT_KDF_VERSION,
                },
                select: { id: true, vaultGeneration: true },
            })
        })

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
