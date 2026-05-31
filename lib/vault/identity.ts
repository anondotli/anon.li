import type { NextResponse } from "next/server"

import { apiError, ErrorCodes } from "@/lib/api-response"
import { prisma } from "@/lib/prisma"

/**
 * Vault identity assertion.
 *
 * Confirms that a caller's claimed vault (`vaultId` + `vaultGeneration`) matches
 * the user's current `UserSecurity` record before wrapped keys are persisted or
 * served. Previously this fetch-and-compare logic was copy-pasted across ~7
 * server actions and API routes with subtly different error surfaces.
 *
 * The comparison lives once in {@link checkVaultIdentity}; callers choose how to
 * surface a failure: server actions use the throwing {@link assertVaultIdentity},
 * API routes use {@link vaultIdentityErrorResponse}.
 */

type VaultIdentityReason = "missing" | "identity" | "generation"

export type VaultIdentityCheck = { ok: true } | { ok: false; reason: VaultIdentityReason }

const VAULT_IDENTITY_MESSAGES: Record<VaultIdentityReason, string> = {
    missing: "Vault security is not configured",
    identity: "Vault identity mismatch",
    generation: "Vault generation mismatch",
}

function vaultIdentityMessage(reason: VaultIdentityReason): string {
    return VAULT_IDENTITY_MESSAGES[reason]
}

/** Pure comparison of a fetched security record against the claimed vault identity. */
export function checkVaultIdentity(
    security: { id: string; vaultGeneration: number } | null | undefined,
    expected: { vaultId: string; vaultGeneration: number }
): VaultIdentityCheck {
    if (!security) return { ok: false, reason: "missing" }
    if (security.id !== expected.vaultId) return { ok: false, reason: "identity" }
    if (security.vaultGeneration !== expected.vaultGeneration) return { ok: false, reason: "generation" }
    return { ok: true }
}

/**
 * Fetch the user's security record and assert it matches the claimed vault.
 * Throws an `Error` on mismatch — for use inside server actions.
 */
export async function assertVaultIdentity(
    userId: string,
    vaultId: string,
    vaultGeneration: number
): Promise<void> {
    const security = await prisma.userSecurity.findUnique({
        where: { userId },
        select: { id: true, vaultGeneration: true },
    })
    const result = checkVaultIdentity(security, { vaultId, vaultGeneration })
    if (!result.ok) throw new Error(vaultIdentityMessage(result.reason))
}

/**
 * Map a vault-identity check to an API error response, or `null` when it passes.
 * `missing` → 404; identity/generation mismatch → 409. Callers wrap the returned
 * response with `withNoStore` where the route requires it.
 */
export function vaultIdentityErrorResponse(
    check: VaultIdentityCheck,
    requestId: string
): NextResponse | null {
    if (check.ok) return null
    const isMissing = check.reason === "missing"
    return apiError(
        vaultIdentityMessage(check.reason),
        isMissing ? ErrorCodes.NOT_FOUND : ErrorCodes.CONFLICT,
        requestId,
        isMissing ? 404 : 409
    )
}
