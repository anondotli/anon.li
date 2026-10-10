import { siteConfig } from "../../config/site"

export const MCP_OAUTH_SCOPES = [
    "anon.li:aliases",
    "anon.li:drops",
    "anon.li:forms",
    "offline_access",
] as const

export const MCP_DEFAULT_SCOPE = MCP_OAUTH_SCOPES.join(" ")

/** Short human-readable names for granted scopes (Settings → Connected apps). */
const MCP_SCOPE_LABELS: Record<string, string> = {
    "anon.li:aliases": "Aliases",
    "anon.li:drops": "Drops",
    "anon.li:forms": "Forms",
    offline_access: "Stay connected",
}

export function mcpScopeLabel(scope: string): string {
    return MCP_SCOPE_LABELS[scope] ?? scope
}

/** Path of the MCP endpoint; `${origin}${MCP_RESOURCE_PATH}` is the RFC 8707 resource. */
export const MCP_RESOURCE_PATH = "/api/mcp"

const MCP_OIDC_COMPATIBILITY_SCOPES = new Set(["openid", "profile", "email"])

/** Functional tool-gating scopes (`offline_access` is a refresh-token hint, not a tool gate). */
const MCP_FUNCTIONAL_SCOPES: readonly string[] = MCP_OAUTH_SCOPES.filter((scope) => scope !== "offline_access")

type OAuthMetadataRecord = Record<string, unknown>

/** Public origin of the app (`NEXT_PUBLIC_APP_URL`, falling back to the production site). */
export function getAppOrigin(): string {
    return new URL(process.env.NEXT_PUBLIC_APP_URL || siteConfig.default.url).origin
}

/**
 * OAuth issuer. Kept at the bare origin (as in better-auth 1.6) so the RFC 8414
 * document lives at the root `/.well-known/oauth-authorization-server` and the
 * issuer clients cached before the 1.7 upgrade still matches.
 */
export function getMcpIssuer(): string {
    return getAppOrigin()
}

/**
 * JWKS URL `/api/mcp` verifies access tokens against, or undefined for the
 * default (`${origin}/api/auth/jwks`). On Vercel previews behind Deployment
 * Protection that self-fetch is blocked, so append Vercel's automation bypass
 * token when one is configured. Server-side only; never sent to clients.
 */
export function getMcpJwksUrl(): string | undefined {
    const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
    if (process.env.VERCEL_ENV !== "preview" || !bypass) return undefined
    const url = new URL("/api/auth/jwks", getAppOrigin())
    url.searchParams.set("x-vercel-protection-bypass", bypass)
    return url.toString()
}

/** Canonical protected-resource identifier every MCP access token is bound to. */
export function getMcpResource(): string {
    return `${getAppOrigin()}${MCP_RESOURCE_PATH}`
}

/**
 * Map the `resource` values MCP clients send for this server onto the canonical
 * identifier. better-auth 1.6 advertised the bare origin as the resource, so
 * clients that cached it (or that add a trailing slash) are folded in. Any
 * other value is returned unchanged and rejected by the provider.
 */
export function canonicalizeMcpResource(value: string | null | undefined): string | null {
    const resource = getMcpResource()
    if (value === null || value === undefined || value === "") return resource
    const origin = getAppOrigin()
    const aliases = new Set([resource, `${resource}/`, origin, `${origin}/`])
    return aliases.has(value) ? resource : value
}

export function normalizeMcpRequestedScope(scope: string | null | undefined): string {
    const requestedScopes = (scope?.trim() ? scope : MCP_DEFAULT_SCOPE).split(/\s+/).filter(Boolean)
    const usableScopes = requestedScopes.filter((requestedScope) => !MCP_OIDC_COMPATIBILITY_SCOPES.has(requestedScope))

    // A client that requests only OIDC-compatibility scopes (openid/profile/email)
    // leaves zero usable scopes after filtering. Fall back to the default set
    // when no functional anon.li scope survives; deliberate narrowing (e.g. only
    // anon.li:drops) is preserved.
    const hasFunctionalScope = usableScopes.some((requestedScope) => MCP_FUNCTIONAL_SCOPES.includes(requestedScope))
    const scopes = hasFunctionalScope ? usableScopes : [...MCP_OAUTH_SCOPES]

    return Array.from(new Set(scopes)).join(" ")
}

/**
 * Trim the provider's RFC 8414 document to what anon.li actually serves:
 * introspection, userinfo and back-channel logout are disabled, and only the
 * anon.li scopes are offered.
 */
export function normalizeMcpAuthorizationMetadata(metadata: object | null): OAuthMetadataRecord | null {
    if (!metadata) return null

    const {
        introspection_endpoint: _introspectionEndpoint,
        introspection_endpoint_auth_methods_supported: _introspectionAuthMethods,
        introspection_endpoint_auth_signing_alg_values_supported: _introspectionAlgs,
        backchannel_logout_supported: _backchannelLogout,
        backchannel_logout_session_supported: _backchannelLogoutSession,
        userinfo_endpoint: _userinfoEndpoint,
        claims_supported: _claimsSupported,
        subject_types_supported: _subjectTypesSupported,
        id_token_signing_alg_values_supported: _idTokenSigningAlgValuesSupported,
        acr_values_supported: _acrValuesSupported,
        ...oauthMetadata
    } = metadata as OAuthMetadataRecord

    return {
        ...oauthMetadata,
        scopes_supported: MCP_OAUTH_SCOPES,
    }
}
