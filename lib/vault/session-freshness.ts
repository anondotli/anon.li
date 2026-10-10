/**
 * "Fresh session" window for sensitive vault operations (vault setup, password
 * change). Shared by the server gate (lib/vault/server.ts) and the client, so
 * the UI can ask the user to sign in again BEFORE they fill in a form the
 * server would reject.
 */
const VAULT_FRESH_SESSION_MAX_AGE_MS = 4 * 60 * 60 * 1000

/**
 * API error code returned (401) when a signed-in session is older than the
 * window. Mirrors `ErrorCodes.SESSION_NOT_FRESH` in lib/api-response.ts, which
 * is server-only and must not be pulled into client bundles.
 */
export const SESSION_NOT_FRESH_ERROR_CODE = "SESSION_NOT_FRESH"

export function isVaultSessionFresh(createdAt: Date | string | number | null | undefined, now = Date.now()): boolean {
    if (createdAt === null || createdAt === undefined) return false
    const createdAtMs = new Date(createdAt).getTime()
    return Number.isFinite(createdAtMs) && now - createdAtMs < VAULT_FRESH_SESSION_MAX_AGE_MS
}
