import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { apiError, apiSuccess, ErrorCodes, generateRequestId, withNoStore } from "@/lib/api-response"
import { logVaultError, logVaultWarn } from "@/lib/vault/api"
import {
    DropOwnerKeyConflictError,
    persistOwnedDropKey,
} from "@/lib/vault/drop-owner-keys"
import { getVaultSession } from "@/lib/vault/server"
import { getVaultSchemaState, VAULT_SCHEMA_UNAVAILABLE_MESSAGE } from "@/lib/vault/schema"
import { enforceVaultRequestGuards } from "@/lib/vault/http"
import {
    vaultGenerationSchema,
    vaultIdSchema,
    wrappedDropKeySchema,
} from "@/lib/vault/validation"

const storeDropKeySchema = z.object({
    dropId: z.string().min(1),
    wrappedKey: wrappedDropKeySchema,
    vaultId: vaultIdSchema,
    vaultGeneration: vaultGenerationSchema,
})
const ROUTE_NAME = "drop-keys"

export async function GET(request: Request) {
    const requestId = generateRequestId()
    try {
        const session = await getVaultSession()

        if (!session) {
            logVaultWarn(ROUTE_NAME, "Unauthorized drop key lookup", { requestId })
            return withNoStore(apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, requestId, 401))
        }

        const blocked = await enforceVaultRequestGuards({
            request,
            requestId,
            identifier: session.user.id,
            route: ROUTE_NAME,
            rateLimitKey: "vaultDropKeysRead",
        })
        if (blocked) return blocked

        const vaultSchema = await getVaultSchemaState()
        if (!vaultSchema.userSecurity || !vaultSchema.dropOwnerKeys) {
            logVaultError(ROUTE_NAME, "Vault schema unavailable during drop key lookup", undefined, {
                requestId,
                userId: session.user.id,
            })
            return withNoStore(apiError(VAULT_SCHEMA_UNAVAILABLE_MESSAGE, ErrorCodes.SERVICE_UNAVAILABLE, requestId, 503))
        }

        const url = new URL(request.url)
        const dropId = url.searchParams.get("dropId")

        if (dropId) {
            const dropKey = await prisma.dropOwnerKey.findUnique({
                where: { dropId },
                select: {
                    userId: true,
                    dropId: true,
                    wrappedKey: true,
                    vaultGeneration: true,
                },
            })

            if (!dropKey || dropKey.userId !== session.user.id) {
                logVaultWarn(ROUTE_NAME, "Drop key not found for user", {
                    requestId,
                    userId: session.user.id,
                    data: { dropId },
                })
                return withNoStore(apiError("Drop key not found", ErrorCodes.NOT_FOUND, requestId, 404))
            }

            return withNoStore(apiSuccess(dropKey, requestId))
        }

        const dropKeys = await prisma.dropOwnerKey.findMany({
            where: { userId: session.user.id },
            orderBy: { updatedAt: "desc" },
            select: {
                dropId: true,
                wrappedKey: true,
                vaultGeneration: true,
            },
        })

        return withNoStore(apiSuccess(dropKeys, requestId))
    } catch (error) {
        logVaultError(ROUTE_NAME, "Drop key lookup failed", error, { requestId })
        return withNoStore(apiError("Internal server error", ErrorCodes.INTERNAL_ERROR, requestId, 500))
    }
}

export async function POST(request: Request) {
    const requestId = generateRequestId()
    try {
        const session = await getVaultSession()
        const url = new URL(request.url)
        const allowMissingDrop = url.searchParams.get("migration") === "1"

        if (!session) {
            logVaultWarn(ROUTE_NAME, "Unauthorized drop key store attempt", { requestId })
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
        if (!vaultSchema.userSecurity || !vaultSchema.dropOwnerKeys) {
            logVaultError(ROUTE_NAME, "Vault schema unavailable during drop key store", undefined, {
                requestId,
                userId: session.user.id,
            })
            return withNoStore(apiError(VAULT_SCHEMA_UNAVAILABLE_MESSAGE, ErrorCodes.SERVICE_UNAVAILABLE, requestId, 503))
        }

        const body = await request.json().catch(() => null)
        const validation = storeDropKeySchema.safeParse(body)

        if (!validation.success) {
            logVaultWarn(ROUTE_NAME, "Invalid drop key payload", {
                requestId,
                userId: session.user.id,
            })
            return withNoStore(apiError("Invalid request body", ErrorCodes.VALIDATION_ERROR, requestId, 400))
        }

        const [security, drop] = await Promise.all([
            prisma.userSecurity.findUnique({
                where: { userId: session.user.id },
                select: { id: true, vaultGeneration: true },
            }),
            prisma.drop.findUnique({
                where: { id: validation.data.dropId },
                select: { userId: true },
            }),
        ])

        if (!security) {
            logVaultWarn(ROUTE_NAME, "Drop key store attempted without configured vault security", {
                requestId,
                userId: session.user.id,
            })
            return withNoStore(apiError("Vault security is not configured", ErrorCodes.NOT_FOUND, requestId, 404))
        }

        if (!drop || drop.userId !== session.user.id) {
            if (allowMissingDrop) {
                return withNoStore(apiSuccess({
                    dropId: validation.data.dropId,
                    vaultGeneration: validation.data.vaultGeneration,
                    skipped: true,
                }, requestId))
            }

            logVaultWarn(ROUTE_NAME, "Drop key store attempted for missing or unauthorized drop", {
                requestId,
                userId: session.user.id,
                data: { dropId: validation.data.dropId },
            })
            return withNoStore(apiError("Drop not found", ErrorCodes.NOT_FOUND, requestId, 404))
        }

        if (validation.data.vaultId !== security.id) {
            logVaultWarn(ROUTE_NAME, "Drop key store rejected due to vault identity mismatch", {
                requestId,
                userId: session.user.id,
                data: { dropId: validation.data.dropId },
            })
            return withNoStore(apiError("Vault identity mismatch", ErrorCodes.CONFLICT, requestId, 409))
        }

        if (validation.data.vaultGeneration !== security.vaultGeneration) {
            logVaultWarn(ROUTE_NAME, "Drop key store rejected due to vault generation mismatch", {
                requestId,
                userId: session.user.id,
                data: { dropId: validation.data.dropId },
            })
            return withNoStore(apiError("Vault generation mismatch", ErrorCodes.CONFLICT, requestId, 409))
        }

        try {
            await persistOwnedDropKey(
                prisma,
                session.user.id,
                validation.data.dropId,
                validation.data.wrappedKey,
                validation.data.vaultGeneration,
            )
        } catch (error) {
            if (error instanceof DropOwnerKeyConflictError) {
                logVaultWarn(ROUTE_NAME, "Drop key store rejected due to ownership conflict", {
                    requestId,
                    userId: session.user.id,
                    data: { dropId: validation.data.dropId },
                })
                return withNoStore(apiError("Drop key not found", ErrorCodes.NOT_FOUND, requestId, 404))
            }

            throw error
        }

        return withNoStore(apiSuccess({
            dropId: validation.data.dropId,
            vaultGeneration: validation.data.vaultGeneration,
        }, requestId))
    } catch (error) {
        logVaultError(ROUTE_NAME, "Drop key store failed", error, { requestId })
        return withNoStore(apiError("Internal server error", ErrorCodes.INTERNAL_ERROR, requestId, 500))
    }
}
