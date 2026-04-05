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
    label?: string | null
    note?: string | null
    createdAt: Date
    updatedAt: Date
    recipients?: AliasRecipientInfo[]
}) {
    return {
        id: alias.id,
        email: alias.email,
        active: alias.active,
        description: alias.label || alias.note || null,
        label: alias.label || null,
        note: alias.note || null,
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
