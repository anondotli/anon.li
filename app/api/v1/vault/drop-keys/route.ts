import { z } from "zod"

import { apiError, apiSuccess, ErrorCodes, withNoStore } from "@/lib/api-response"
import { isOrgScope, ownerWhere } from "@/lib/ownership"
import { prisma } from "@/lib/prisma"
import { scopeFromContext, withPolicy } from "@/lib/route-policy"
import {
    DropOwnerKeyConflictError,
    persistOwnedDropKey,
} from "@/lib/vault/drop-owner-keys"
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

        const scope = scopeFromContext(ctx)
        const url = new URL(ctx.request.url)
        const dropId = url.searchParams.get("drop_id") || url.searchParams.get("dropId")

        if (dropId) {
            const dropKey = await prisma.dropOwnerKey.findFirst({
                where: {
                    dropId,
                    ...ownerWhere(scope),
                    drop: ownerWhere(scope),
                },
                select: {
                    dropId: true,
                    wrappedKey: true,
                    vaultGeneration: true,
                    organizationId: true,
                    orgKeyGeneration: true,
                },
            })

            if (!dropKey) {
                return withNoStore(apiError("Drop key not found", ErrorCodes.NOT_FOUND, ctx.requestId, 404))
            }

            return withNoStore(apiSuccess({
                drop_id: dropKey.dropId,
                wrapped_key: dropKey.wrappedKey,
                vault_generation: dropKey.vaultGeneration,
                ...(dropKey.organizationId
                    ? {
                        organization_id: dropKey.organizationId,
                        org_key_generation: dropKey.orgKeyGeneration,
                    }
                    : {}),
            }, ctx.requestId))
        }

        const dropKeys = await prisma.dropOwnerKey.findMany({
            where: {
                ...ownerWhere(scope),
                drop: ownerWhere(scope),
            },
            orderBy: { updatedAt: "desc" },
            select: {
                dropId: true,
                wrappedKey: true,
                vaultGeneration: true,
                organizationId: true,
                orgKeyGeneration: true,
            },
        })

        return withNoStore(apiSuccess(dropKeys.map((dropKey) => ({
            drop_id: dropKey.dropId,
            wrapped_key: dropKey.wrappedKey,
            vault_generation: dropKey.vaultGeneration,
            ...(dropKey.organizationId
                ? {
                    organization_id: dropKey.organizationId,
                    org_key_generation: dropKey.orgKeyGeneration,
                }
                : {}),
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

        const scope = scopeFromContext(ctx)
        const body = await ctx.request.json().catch(() => null)
        const validation = storeDropKeySchema.safeParse(body)
        if (!validation.success) {
            return withNoStore(apiError("Invalid request body", ErrorCodes.VALIDATION_ERROR, ctx.requestId, 400))
        }

        const drop = await prisma.drop.findFirst({
            where: { id: validation.data.drop_id, ...ownerWhere(scope) },
            select: { id: true },
        })

        if (!drop) {
            return withNoStore(apiError("Drop not found", ErrorCodes.NOT_FOUND, ctx.requestId, 404))
        }

        let orgBinding: { organizationId: string; orgKeyGeneration: number } | undefined
        if (isOrgScope(scope)) {
            const organization = await prisma.organization.findUnique({
                where: { id: scope.organizationId },
                select: { orgKeyGeneration: true },
            })
            if (!organization || organization.orgKeyGeneration < 1) {
                return withNoStore(apiError("Team encryption key is not set up yet", ErrorCodes.CONFLICT, ctx.requestId, 409))
            }
            orgBinding = {
                organizationId: scope.organizationId,
                orgKeyGeneration: organization.orgKeyGeneration,
            }
        } else {
            const security = await prisma.userSecurity.findUnique({
                where: { userId: scope.userId },
                select: { id: true, vaultGeneration: true },
            })

            if (!security) {
                return withNoStore(apiError("Vault security is not configured", ErrorCodes.NOT_FOUND, ctx.requestId, 404))
            }

            if (validation.data.vault_id !== security.id) {
                return withNoStore(apiError("Vault identity mismatch", ErrorCodes.CONFLICT, ctx.requestId, 409))
            }

            if (validation.data.vault_generation !== security.vaultGeneration) {
                return withNoStore(apiError("Vault generation mismatch", ErrorCodes.CONFLICT, ctx.requestId, 409))
            }
        }

        try {
            await persistOwnedDropKey(
                prisma,
                ctx.userId,
                validation.data.drop_id,
                validation.data.wrapped_key,
                validation.data.vault_generation,
                orgBinding,
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
            ...(orgBinding
                ? {
                    organization_id: orgBinding.organizationId,
                    org_key_generation: orgBinding.orgKeyGeneration,
                }
                : {}),
        }, ctx.requestId))
    },
)
