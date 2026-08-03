"use client"

import { z } from "zod"

const base64Url = z.string().regex(/^[A-Za-z0-9_-]+$/)
const resourceId = z.string().min(1).max(64)
const generation = z.number().int().positive()

export const WrappedDropKeyRecordSchema = z.object({
    dropId: resourceId,
    wrappedKey: base64Url.min(16).max(2_048),
    vaultGeneration: generation,
    organizationId: resourceId.nullable().optional(),
    orgKeyGeneration: generation.nullable().optional(),
}).strict()

export const WrappedFormKeyRecordSchema = z.object({
    formId: resourceId,
    wrappedKey: base64Url.min(16).max(2_048),
    vaultGeneration: generation,
    organizationId: resourceId.nullable().optional(),
    orgKeyGeneration: generation.nullable().optional(),
}).strict()

export const IdentityMaterialSchema = z.object({
    identityPublicKey: base64Url.min(80).max(256).nullable(),
    wrappedIdentityPrivateKey: base64Url.min(100).max(2_048).nullable(),
    identityKeyGeneration: generation.nullable(),
}).strict()

export const PendingMemberSchema = z.object({
    userId: resourceId,
    identityPublicKey: base64Url.min(80).max(256),
}).strict()

export const OwnMemberKeyResponseSchema = z.object({
    memberKey: z.object({
        wrappedOrgVaultKey: z.string().min(1).max(4_096),
        orgKeyGeneration: generation,
    }).strict().nullable(),
    currentGeneration: z.number().int().nonnegative(),
}).strict()

export function parseVaultData<T>(schema: z.ZodType<T>): (value: unknown) => T {
    return (value) => {
        const parsed = schema.safeParse(value)
        if (!parsed.success) throw new Error("Vault API returned an invalid response")
        return parsed.data
    }
}
