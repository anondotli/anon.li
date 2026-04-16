import { z } from "zod"

export const BASE64URL_REGEX = /^[A-Za-z0-9_-]+$/

function base64UrlSchema(options?: {
    min?: number
    max?: number
    exactLength?: number
    message?: string
}) {
    let schema = z
        .string()
        .regex(BASE64URL_REGEX, options?.message ?? "Must be a base64url-encoded value")

    if (options?.exactLength !== undefined) {
        schema = schema.length(options.exactLength)
    }

    if (options?.min !== undefined) {
        schema = schema.min(options.min)
    }

    if (options?.max !== undefined) {
        schema = schema.max(options.max)
    }

    return schema
}

export const vaultIdSchema = z.cuid()
export const authSecretSchema = base64UrlSchema({ min: 16, max: 2048 })
export const authSaltSchema = base64UrlSchema({ exactLength: 43 })
export const vaultSaltSchema = base64UrlSchema({ exactLength: 43 })
export const wrappedVaultKeySchema = base64UrlSchema({ min: 32, max: 2048 })
export const wrappedDropKeySchema = base64UrlSchema({ min: 16, max: 2048 })
export const vaultGenerationSchema = z.number().int().positive()
