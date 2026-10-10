import "server-only"

import { prisma } from "@/lib/prisma"
import { canonicalizeMcpResource, normalizeMcpRequestedScope } from "./oauth-metadata"

/**
 * HTTP-boundary adapters for the better-auth 1.7 OAuth provider endpoints.
 *
 * Parameter rewriting lives here, in `app/api/auth/[...all]/route.ts`, and not
 * in a better-auth before-hook: after consent the provider completes the
 * authorization by re-dispatching `/oauth2/authorize` *through the hooks*, so a
 * hook that forced `prompt=consent` would send the user back to the consent
 * screen forever. Rewriting the incoming request only touches what the client
 * sent.
 */

const AUTH_BASE_PATH = "/api/auth"
export const OAUTH_AUTHORIZE_PATH = `${AUTH_BASE_PATH}/oauth2/authorize`
export const OAUTH_TOKEN_PATH = `${AUTH_BASE_PATH}/oauth2/token`
export const OAUTH_REGISTER_PATH = `${AUTH_BASE_PATH}/oauth2/register`
export const OAUTH_REVOKE_PATH = `${AUTH_BASE_PATH}/oauth2/revoke`

/**
 * better-auth 1.6's MCP plugin served OAuth under `/mcp/*`. Clients that cached
 * those endpoints (or their DCR registration) keep working through an alias.
 */
const LEGACY_MCP_OAUTH_PATHS: Readonly<Record<string, string>> = {
    [`${AUTH_BASE_PATH}/mcp/authorize`]: OAUTH_AUTHORIZE_PATH,
    [`${AUTH_BASE_PATH}/mcp/token`]: OAUTH_TOKEN_PATH,
    [`${AUTH_BASE_PATH}/mcp/register`]: OAUTH_REGISTER_PATH,
}

/** The legacy `/api/auth/mcp/*` path mapped onto its `/oauth2/*` successor (other paths unchanged). */
export function rewriteLegacyMcpOAuthPath(url: URL): URL {
    const target = LEGACY_MCP_OAUTH_PATHS[url.pathname]
    if (!target) return url
    const rewritten = new URL(url)
    rewritten.pathname = target
    return rewritten
}

/** Collapse `resource` parameters onto the canonical MCP resource (injecting it when absent). */
function normalizeResourceParams(params: URLSearchParams): void {
    const values = params.getAll("resource")
    const canonical = values.length === 0
        ? [canonicalizeMcpResource(null)]
        : values.map((value) => canonicalizeMcpResource(value))
    params.delete("resource")
    for (const value of new Set(canonical)) {
        if (value) params.append("resource", value)
    }
}

/**
 * Authorization request normalization:
 *
 * - `scope`: OIDC-compatibility scopes are stripped (this server is a plain
 *   OAuth AS); an empty result falls back to the full anon.li set.
 * - `prompt=consent`: the provider only shows the consent screen when prompted
 *   (or when no prior consent exists). Forcing it means every authorization —
 *   including from a dynamically registered, attacker-controllable client — needs
 *   explicit user approval. The signed query handed to the login/consent pages
 *   is built from this rewritten request, so the requirement survives sign-in.
 * - `max_age` is dropped: the login page is the consent page here, so a
 *   re-authentication demand could not be satisfied and would loop.
 * - `resource`: without an RFC 8707 resource the provider issues an opaque
 *   token the MCP endpoint cannot verify; it is bound to the MCP resource.
 */
export function normalizeMcpAuthorizeParams(input: URLSearchParams): URLSearchParams {
    const params = new URLSearchParams(input)
    params.set("scope", normalizeMcpRequestedScope(params.get("scope")))
    params.set("prompt", "consent")
    params.delete("max_age")
    normalizeResourceParams(params)
    return params
}

/** Token request normalization: bind authorization-code and refresh grants to the MCP resource. */
export function normalizeMcpTokenParams(input: URLSearchParams): URLSearchParams {
    const params = new URLSearchParams(input)
    const grantType = params.get("grant_type")
    if (grantType === "authorization_code" || grantType === "refresh_token") {
        normalizeResourceParams(params)
    }
    return params
}

function isImportedLegacyClient(metadata: unknown): boolean {
    return Boolean(
        metadata
        && typeof metadata === "object"
        && !Array.isArray(metadata)
        && (metadata as Record<string, unknown>).anonli_legacy_import,
    )
}

/**
 * better-auth 1.6 never persisted a client's token-endpoint auth method, so the
 * 1.7 migration imported confidential clients as `client_secret_basic` (the
 * RFC 7591 default). 1.7 rejects credentials presented through a different
 * method, so for those imported clients only, body credentials are re-presented
 * as an HTTP Basic header. The provider still verifies the secret.
 */
export async function adaptImportedClientAuthentication(
    params: URLSearchParams,
    headers: Headers,
): Promise<{ params: URLSearchParams; headers: Headers }> {
    const clientId = params.get("client_id")
    const clientSecret = params.get("client_secret")
    if (!clientId || !clientSecret || headers.has("authorization")) return { params, headers }

    const client = await prisma.oauthClient.findUnique({
        where: { clientId },
        select: { tokenEndpointAuthMethod: true, metadata: true },
    })
    if (!client || client.tokenEndpointAuthMethod !== "client_secret_basic" || !isImportedLegacyClient(client.metadata)) {
        return { params, headers }
    }

    const nextParams = new URLSearchParams(params)
    nextParams.delete("client_id")
    nextParams.delete("client_secret")
    const nextHeaders = new Headers(headers)
    const credentials = `${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`
    nextHeaders.set("authorization", `Basic ${Buffer.from(credentials, "utf8").toString("base64")}`)
    return { params: nextParams, headers: nextHeaders }
}
