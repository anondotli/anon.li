import { apiError, ErrorCodes } from "@/lib/api-response"
import { getAliasByEmail, getAliasById } from "@/lib/data/alias"

interface AliasRecipientInfo {
    id: string
    email: string
    isPrimary: boolean
}

/**
 * Transform alias to Addy.io compatible format.
 * When recipients are provided (from join table), include them in the response.
 */
export function toAddyFormat(alias: {
    id: string
    email: string
    active: boolean
    encryptedLabel?: string | null
    encryptedNote?: string | null
    createdAt: Date
    updatedAt: Date
    recipients?: AliasRecipientInfo[]
}) {
    return {
        id: alias.id,
        email: alias.email,
        active: alias.active,
        description: null,
        label: null,
        note: null,
        encrypted_label: alias.encryptedLabel || null,
        encrypted_note: alias.encryptedNote || null,
        metadata_version: 1,
        ...(alias.recipients && {
            recipients: alias.recipients.map((r) => ({
                id: r.id,
                email: r.email,
                is_primary: r.isPrimary,
            })),
        }),
        created_at: alias.createdAt.toISOString(),
        updated_at: alias.updatedAt.toISOString(),
    }
}

export function hasAliasMetadataFields(body: unknown) {
    if (!body || typeof body !== "object") return false
    const fields = body as Record<string, unknown>
    return "description" in fields
        || "label" in fields
        || "note" in fields
        || "encrypted_label" in fields
        || "encrypted_note" in fields
}

export function hasPlaintextAliasMetadataFields(body: unknown) {
    if (!body || typeof body !== "object") return false
    const fields = body as Record<string, unknown>
    return "description" in fields || "label" in fields || "note" in fields
}

export function aliasCreateMetadataError(requestId: string) {
    return apiError(
        "Alias labels and notes are vault-encrypted. Create the alias first, then PATCH encrypted_label or encrypted_note using the returned alias ID.",
        ErrorCodes.VALIDATION_ERROR,
        requestId,
        400,
    )
}

export function aliasPlaintextMetadataError(requestId: string) {
    return apiError(
        "Plaintext alias labels and notes are no longer accepted. Use encrypted_label and encrypted_note.",
        ErrorCodes.VALIDATION_ERROR,
        requestId,
        400,
    )
}

/**
 * Resolve an alias identifier that can be either a UUID or an email address.
 */
export async function resolveAlias(identifier: string, userId: string) {
    if (identifier.includes("@")) {
        const alias = await getAliasByEmail(identifier)
        return alias?.userId === userId ? alias : null
    }
    return getAliasById(identifier, userId)
}
