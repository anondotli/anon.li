import { z } from "zod"

import { apiError, apiSuccess, ErrorCodes, withNoStore, zodErrorToDetails } from "@/lib/api-response"
import { isOrgScope } from "@/lib/ownership"
import { prisma } from "@/lib/prisma"
import { scopeFromContext, withPolicy } from "@/lib/route-policy"
import { verifyCredentialSecret } from "@/lib/vault/server"
import { authSecretSchema } from "@/lib/vault/validation"

export const dynamic = "force-dynamic"

const unlockSchema = z.object({
    auth_secret: authSecretSchema,
}).strict()

export const POST = withPolicy(
    {
        auth: "api_key",
        rateLimit: "vaultOps",
    },
    async (ctx) => {
        if (!ctx.userId) {
            return withNoStore(apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, ctx.requestId, 401))
        }
        if (isOrgScope(scopeFromContext(ctx))) {
            return withNoStore(apiError("A personal API key is required", ErrorCodes.FORBIDDEN, ctx.requestId, 403))
        }

        const body = await ctx.request.json().catch(() => null)
        const validation = unlockSchema.safeParse(body)
        if (!validation.success) {
            return withNoStore(apiError(
                "Validation failed",
                ErrorCodes.VALIDATION_ERROR,
                ctx.requestId,
                400,
                zodErrorToDetails(validation.error),
            ))
        }

        const security = await prisma.userSecurity.findUnique({
            where: { userId: ctx.userId },
            select: {
                id: true,
                vaultSalt: true,
                passwordWrappedVaultKey: true,
                vaultGeneration: true,
                kdfVersion: true,
            },
        })

        if (!security) {
            return withNoStore(apiError("Vault security is not configured", ErrorCodes.NOT_FOUND, ctx.requestId, 404))
        }

        const credentialValid = await verifyCredentialSecret(ctx.userId, validation.data.auth_secret)
        if (!credentialValid) {
            return withNoStore(apiError("Incorrect vault password", ErrorCodes.UNAUTHORIZED, ctx.requestId, 401))
        }

        return withNoStore(apiSuccess({
            vault_id: security.id,
            vault_generation: security.vaultGeneration,
            vault_salt: security.vaultSalt,
            password_wrapped_vault_key: security.passwordWrappedVaultKey,
            kdf_version: security.kdfVersion,
        }, ctx.requestId))
    },
)
