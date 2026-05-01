import "server-only"

import { prisma } from "@/lib/prisma"

interface VaultSchemaState {
    userSecurity: boolean
    dropOwnerKeys: boolean
    formOwnerKeys: boolean
}

export const VAULT_SCHEMA_UNAVAILABLE_MESSAGE =
    "Vault features are temporarily unavailable until the database migration is applied."

const VAULT_SCHEMA_CACHE_TTL_MS = 10_000

let cachedVaultSchemaState:
    | {
          checkedAt: number
          state: VaultSchemaState
      }
    | null = null

export async function getVaultSchemaState(): Promise<VaultSchemaState> {
    const now = Date.now()

    if (cachedVaultSchemaState && now - cachedVaultSchemaState.checkedAt < VAULT_SCHEMA_CACHE_TTL_MS) {
        return cachedVaultSchemaState.state
    }

    const [row] = await prisma.$queryRaw<Array<{
        userSecurity: string | null
        dropOwnerKeys: string | null
        formOwnerKeys: string | null
    }>>`
        SELECT
            to_regclass('public.user_security')::text AS "userSecurity",
            to_regclass('public.drop_owner_keys')::text AS "dropOwnerKeys",
            to_regclass('public.form_owner_keys')::text AS "formOwnerKeys"
    `

    const state = {
        userSecurity: Boolean(row?.userSecurity),
        dropOwnerKeys: Boolean(row?.dropOwnerKeys),
        formOwnerKeys: Boolean(row?.formOwnerKeys),
    }

    cachedVaultSchemaState = {
        checkedAt: now,
        state,
    }

    return state
}
