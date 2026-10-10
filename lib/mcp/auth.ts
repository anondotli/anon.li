import "server-only"

import { prisma } from "@/lib/prisma"
import type { McpSession } from "./types"

/**
 * Map verified MCP access-token claims (better-auth 1.7 oauth-provider JWT)
 * onto the session the tool gate uses: `sub` is the user, `azp`/`client_id`
 * the OAuth client and `scope` the granted scopes. Tokens without a user
 * subject or client are rejected.
 */
export function mcpSessionFromClaims(claims: Record<string, unknown>): McpSession | null {
    const userId = typeof claims.sub === "string" && claims.sub.length > 0 ? claims.sub : null
    const clientIdClaim = typeof claims.azp === "string" && claims.azp.length > 0 ? claims.azp : claims.client_id
    const clientId = typeof clientIdClaim === "string" && clientIdClaim.length > 0 ? clientIdClaim : null
    if (!userId || !clientId) return null
    return {
        userId,
        clientId,
        scopes: typeof claims.scope === "string" ? claims.scope : "",
    }
}

/**
 * Tolerance for clock skew between the instance that recorded the consent and
 * the one that signed the token (both use the app clock, at 1 s granularity).
 */
const GRANT_CLOCK_SKEW_MS = 60_000

/**
 * JWT access tokens are verified statelessly, so revoking access would
 * otherwise not take effect until the token expires. Checked on every MCP
 * request, in one indexed lookup:
 * - the OAuth client still exists and is not disabled (admin kill switch);
 * - the user still has a consent for the client (Settings → Connected apps
 *   deletes it on revoke);
 * - that consent predates the token, so a token issued before a revoke does
 *   not come back to life when the user reconnects the same client.
 */
export async function isMcpGrantActive(session: McpSession, issuedAtSeconds: number | null): Promise<boolean> {
    const issuedBefore = issuedAtSeconds === null ? null : new Date(issuedAtSeconds * 1000 + GRANT_CLOCK_SKEW_MS)
    const client = await prisma.oauthClient.findUnique({
        where: { clientId: session.clientId },
        select: {
            disabled: true,
            consents: {
                where: {
                    userId: session.userId,
                    ...(issuedBefore ? { createdAt: { lte: issuedBefore } } : {}),
                },
                select: { id: true },
                take: 1,
            },
        },
    })
    return Boolean(client && !client.disabled && client.consents.length > 0)
}

/** `iat` (seconds since the epoch) of verified token claims, when present. */
export function tokenIssuedAt(claims: Record<string, unknown>): number | null {
    return typeof claims.iat === "number" && Number.isFinite(claims.iat) ? claims.iat : null
}
