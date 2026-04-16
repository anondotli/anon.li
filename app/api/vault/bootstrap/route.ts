import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getClientIp, rateLimit } from "@/lib/rate-limit"
import { apiError, apiSuccess, ErrorCodes, generateRequestId, withNoStore } from "@/lib/api-response"
import { logVaultError, logVaultWarn } from "@/lib/vault/api"
import { createFakeAuthSalt, normalizeEmail, VAULT_KDF_VERSION } from "@/lib/vault/server"
import { getVaultSchemaState } from "@/lib/vault/schema"

const bootstrapSchema = z.object({
    email: z.email(),
})
const ROUTE_NAME = "bootstrap"

export async function POST(request: Request) {
    const requestId = generateRequestId()
    try {
        const clientIp = await getClientIp()
        const ipRateLimited = await rateLimit("vaultBootstrap", clientIp)
        if (ipRateLimited) {
            logVaultWarn(ROUTE_NAME, "Vault bootstrap rate limited", { requestId, data: { clientIp } })
            return withNoStore(ipRateLimited)
        }

        const body = await request.json().catch(() => null)
        const validation = bootstrapSchema.safeParse(body)

        if (!validation.success) {
            logVaultWarn(ROUTE_NAME, "Invalid vault bootstrap payload", { requestId })
            return withNoStore(apiError("Invalid email address", ErrorCodes.VALIDATION_ERROR, requestId, 400))
        }

        const email = normalizeEmail(validation.data.email)
        const emailRateLimited = await rateLimit("vaultBootstrap", `email:${email}`)
        if (emailRateLimited) {
            logVaultWarn(ROUTE_NAME, "Vault bootstrap rate limited per email", { requestId })
            return withNoStore(emailRateLimited)
        }

        const fakeAuthSalt = createFakeAuthSalt(email)
        const vaultSchema = await getVaultSchemaState()

        // CSRF-exempt: read-only, public salt lookup. Returns deterministic fake salt
        // for unknown emails to avoid enumeration.
        if (!vaultSchema.userSecurity) {
            return withNoStore(apiSuccess({
                authSalt: fakeAuthSalt,
                kdfVersion: VAULT_KDF_VERSION,
            }, requestId))
        }

        const user = await prisma.user.findUnique({
            where: { email },
            select: {
                security: {
                    select: {
                        authSalt: true,
                        kdfVersion: true,
                    },
                },
            },
        })

        return withNoStore(apiSuccess({
            authSalt: user?.security?.authSalt ?? fakeAuthSalt,
            kdfVersion: user?.security?.kdfVersion ?? VAULT_KDF_VERSION,
        }, requestId))
    } catch (error) {
        logVaultError(ROUTE_NAME, "Vault bootstrap failed", error, { requestId })
        return withNoStore(apiError("Internal server error", ErrorCodes.INTERNAL_ERROR, requestId, 500))
    }
}
