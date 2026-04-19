import { z } from "zod"

import { apiError, apiSuccess, ErrorCodes, withNoStore } from "@/lib/api-response"
import { prisma } from "@/lib/prisma"
import { withPolicy } from "@/lib/route-policy"
import {
    DropOwnerKeyConflictError,
    persistOwnedDropKey,
} from "@/lib/vault/drop-owner-keys"
import { getVaultSchemaState, VAULT_SCHEMA_UNAVAILABLE_MESSAGE } from "@/lib/vault/schema"
import {
    vaultGenerationSchema,
    vaultIdSchema,
    wrappedDropKeySchema,
} from "@/lib/vault/validation"

export const dynamic = "force-dynamic"

const storeDropKeySchema = z.object({
    drop_id: z.string().min(1),
    wrapped_key: wrappedDropKeySchema,
    vault_id: vaultIdSchema,
    vault_generation: vaultGenerationSchema,
}).strict()

export const GET = withPolicy(
    {
        auth: "api_key",
        rateLimit: "vaultDropKeysRead",
    },
    async (ctx) => {
        if (!ctx.userId) {
            return withNoStore(apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, ctx.requestId, 401))
        }

        const vaultSchema = await getVaultSchemaState()
        if (!vaultSchema.userSecurity || !vaultSchema.dropOwnerKeys) {
            return withNoStore(apiError(
                VAULT_SCHEMA_UNAVAILABLE_MESSAGE,
                ErrorCodes.SERVICE_UNAVAILABLE,
                ctx.requestId,
                503,
            ))
        }

        const url = new URL(ctx.request.url)
        const dropId = url.searchParams.get("drop_id") || url.searchParams.get("dropId")

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

            if (!dropKey || dropKey.userId !== ctx.userId) {
                return withNoStore(apiError("Drop key not found", ErrorCodes.NOT_FOUND, ctx.requestId, 404))
            }

            return withNoStore(apiSuccess({
                drop_id: dropKey.dropId,
                wrapped_key: dropKey.wrappedKey,
                vault_generation: dropKey.vaultGeneration,
            }, ctx.requestId))
        }

        const dropKeys = await prisma.dropOwnerKey.findMany({
            where: { userId: ctx.userId },
            orderBy: { updatedAt: "desc" },
            select: {
                dropId: true,
                wrappedKey: true,
                vaultGeneration: true,
            },
        })

        return withNoStore(apiSuccess(dropKeys.map((dropKey) => ({
            drop_id: dropKey.dropId,
            wrapped_key: dropKey.wrappedKey,
            vault_generation: dropKey.vaultGeneration,
        })), ctx.requestId))
    },
)

export const POST = withPolicy(
    {
        auth: "api_key",
        rateLimit: "vaultOps",
    },
    async (ctx) => {
        if (!ctx.userId) {
            return withNoStore(apiError("Unauthorized", ErrorCodes.UNAUTHORIZED, ctx.requestId, 401))
        }

        const vaultSchema = await getVaultSchemaState()
        if (!vaultSchema.userSecurity || !vaultSchema.dropOwnerKeys) {
            return withNoStore(apiError(
                VAULT_SCHEMA_UNAVAILABLE_MESSAGE,
                ErrorCodes.SERVICE_UNAVAILABLE,
                ctx.requestId,
                503,
            ))
        }

        const body = await ctx.request.json().catch(() => null)
        const validation = storeDropKeySchema.safeParse(body)
        if (!validation.success) {
            return withNoStore(apiError("Invalid request body", ErrorCodes.VALIDATION_ERROR, ctx.requestId, 400))
        }

        const [security, drop] = await Promise.all([
            prisma.userSecurity.findUnique({
                where: { userId: ctx.userId },
                select: { id: true, vaultGeneration: true },
            }),
            prisma.drop.findUnique({
                where: { id: validation.data.drop_id },
                select: { userId: true },
            }),
        ])

        if (!security) {
            return withNoStore(apiError("Vault security is not configured", ErrorCodes.NOT_FOUND, ctx.requestId, 404))
        }

        if (!drop || drop.userId !== ctx.userId) {
            return withNoStore(apiError("Drop not found", ErrorCodes.NOT_FOUND, ctx.requestId, 404))
        }

        if (validation.data.vault_id !== security.id) {
            return withNoStore(apiError("Vault identity mismatch", ErrorCodes.CONFLICT, ctx.requestId, 409))
        }

        if (validation.data.vault_generation !== security.vaultGeneration) {
            return withNoStore(apiError("Vault generation mismatch", ErrorCodes.CONFLICT, ctx.requestId, 409))
        }

        try {
            await persistOwnedDropKey(
                prisma,
                ctx.userId,
                validation.data.drop_id,
                validation.data.wrapped_key,
                validation.data.vault_generation,
            )
        } catch (error) {
            if (error instanceof DropOwnerKeyConflictError) {
                return withNoStore(apiError("Drop key not found", ErrorCodes.NOT_FOUND, ctx.requestId, 404))
            }

            throw error
        }

        return withNoStore(apiSuccess({
            drop_id: validation.data.drop_id,
            vault_generation: validation.data.vault_generation,
        }, ctx.requestId))
    },
)
