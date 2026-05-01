import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { apiError, apiSuccess, ErrorCodes, generateRequestId, withNoStore } from "@/lib/api-response"
import { logVaultError, logVaultWarn } from "@/lib/vault/api"
import {
    FormOwnerKeyConflictError,
    persistOwnedFormKey,
} from "@/lib/vault/form-owner-keys"
import { getVaultSession } from "@/lib/vault/server"
import { getVaultSchemaState, VAULT_SCHEMA_UNAVAILABLE_MESSAGE } from "@/lib/vault/schema"
import { enforceVaultRequestGuards } from "@/lib/vault/http"
import {
    vaultGenerationSchema,
    vaultIdSchema,
    wrappedFormKeySchema,
} from "@/lib/vault/validation"

const storeFormKeySchema = z.object({
    formId: z.string().min(1),
    wrappedKey: wrappedFormKeySchema,
    vaultId: vaultIdSchema,
    vaultGeneration: vaultGenerationSchema,
})
const ROUTE_NAME = "form-keys"

export async function GET(request: Request) {
    const requestId = generateRequestId()
    try {
        const session = await getVaultSession()

        if (!session) {
            logVaultWarn(ROUTE_NAME, "Unauthorized form key lookup", { requestId })
            return withNoStore(apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, requestId, 401))
        }

        const blocked = await enforceVaultRequestGuards({
            request,
            requestId,
            identifier: session.user.id,
            route: ROUTE_NAME,
            rateLimitKey: "vaultFormKeysRead",
        })
        if (blocked) return blocked

        const vaultSchema = await getVaultSchemaState()
        if (!vaultSchema.userSecurity || !vaultSchema.formOwnerKeys) {
            logVaultError(ROUTE_NAME, "Vault schema unavailable during form key lookup", undefined, {
                requestId,
                userId: session.user.id,
            })
            return withNoStore(apiError(VAULT_SCHEMA_UNAVAILABLE_MESSAGE, ErrorCodes.SERVICE_UNAVAILABLE, requestId, 503))
        }

        const url = new URL(request.url)
        const formId = url.searchParams.get("formId")

        if (formId) {
            const formKey = await prisma.formOwnerKey.findUnique({
                where: { formId },
                select: {
                    userId: true,
                    formId: true,
                    wrappedKey: true,
                    vaultGeneration: true,
                },
            })

            if (!formKey || formKey.userId !== session.user.id) {
                logVaultWarn(ROUTE_NAME, "Form key not found for user", {
                    requestId,
                    userId: session.user.id,
                    data: { formId },
                })
                return withNoStore(apiError("Form key not found", ErrorCodes.NOT_FOUND, requestId, 404))
            }

            return withNoStore(apiSuccess(formKey, requestId))
        }

        const formKeys = await prisma.formOwnerKey.findMany({
            where: { userId: session.user.id },
            orderBy: { updatedAt: "desc" },
            select: {
                formId: true,
                wrappedKey: true,
                vaultGeneration: true,
            },
        })

        return withNoStore(apiSuccess(formKeys, requestId))
    } catch (error) {
        logVaultError(ROUTE_NAME, "Form key lookup failed", error, { requestId })
        return withNoStore(apiError("Internal server error", ErrorCodes.INTERNAL_ERROR, requestId, 500))
    }
}

export async function POST(request: Request) {
    const requestId = generateRequestId()
    try {
        const session = await getVaultSession()

        if (!session) {
            logVaultWarn(ROUTE_NAME, "Unauthorized form key store attempt", { requestId })
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
        if (!vaultSchema.userSecurity || !vaultSchema.formOwnerKeys) {
            logVaultError(ROUTE_NAME, "Vault schema unavailable during form key store", undefined, {
                requestId,
                userId: session.user.id,
            })
            return withNoStore(apiError(VAULT_SCHEMA_UNAVAILABLE_MESSAGE, ErrorCodes.SERVICE_UNAVAILABLE, requestId, 503))
        }

        const body = await request.json().catch(() => null)
        const validation = storeFormKeySchema.safeParse(body)

        if (!validation.success) {
            logVaultWarn(ROUTE_NAME, "Invalid form key payload", {
                requestId,
                userId: session.user.id,
            })
            return withNoStore(apiError("Invalid request body", ErrorCodes.VALIDATION_ERROR, requestId, 400))
        }

        const [security, form] = await Promise.all([
            prisma.userSecurity.findUnique({
                where: { userId: session.user.id },
                select: { id: true, vaultGeneration: true },
            }),
            prisma.form.findUnique({
                where: { id: validation.data.formId },
                select: { userId: true },
            }),
        ])

        if (!security) {
            logVaultWarn(ROUTE_NAME, "Form key store attempted without configured vault security", {
                requestId,
                userId: session.user.id,
            })
            return withNoStore(apiError("Vault security is not configured", ErrorCodes.NOT_FOUND, requestId, 404))
        }

        if (!form || form.userId !== session.user.id) {
            logVaultWarn(ROUTE_NAME, "Form key store attempted for missing or unauthorized form", {
                requestId,
                userId: session.user.id,
                data: { formId: validation.data.formId },
            })
            return withNoStore(apiError("Form not found", ErrorCodes.NOT_FOUND, requestId, 404))
        }

        if (validation.data.vaultId !== security.id) {
            return withNoStore(apiError("Vault identity mismatch", ErrorCodes.CONFLICT, requestId, 409))
        }

        if (validation.data.vaultGeneration !== security.vaultGeneration) {
            return withNoStore(apiError("Vault generation mismatch", ErrorCodes.CONFLICT, requestId, 409))
        }

        try {
            await persistOwnedFormKey(
                prisma,
                session.user.id,
                validation.data.formId,
                validation.data.wrappedKey,
                validation.data.vaultGeneration,
            )
        } catch (error) {
            if (error instanceof FormOwnerKeyConflictError) {
                return withNoStore(apiError("Form key not found", ErrorCodes.NOT_FOUND, requestId, 404))
            }
            throw error
        }

        return withNoStore(apiSuccess({
            formId: validation.data.formId,
            vaultGeneration: validation.data.vaultGeneration,
        }, requestId))
    } catch (error) {
        logVaultError(ROUTE_NAME, "Form key store failed", error, { requestId })
        return withNoStore(apiError("Internal server error", ErrorCodes.INTERNAL_ERROR, requestId, 500))
    }
}
