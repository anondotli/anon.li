export const MCP_OAUTH_SCOPES = [
    "anon.li:aliases",
    "anon.li:drops",
    "anon.li:forms",
    "offline_access",
] as const

export const MCP_DEFAULT_SCOPE = MCP_OAUTH_SCOPES.join(" ")

const MCP_OIDC_COMPATIBILITY_SCOPES = new Set(["openid", "profile", "email"])

/** Functional tool-gating scopes (`offline_access` is a refresh-token hint, not a tool gate). */
const MCP_FUNCTIONAL_SCOPES: readonly string[] = MCP_OAUTH_SCOPES.filter((scope) => scope !== "offline_access")

type OAuthMetadata = object
type OAuthMetadataRecord = Record<string, unknown>

export function normalizeMcpRequestedScope(scope: string | null | undefined): string {
    const requestedScopes = (scope?.trim() ? scope : MCP_DEFAULT_SCOPE).split(/\s+/).filter(Boolean)
    const usableScopes = requestedScopes.filter((requestedScope) => !MCP_OIDC_COMPATIBILITY_SCOPES.has(requestedScope))

    // A client that requests only OIDC-compatibility scopes (openid/profile/email)
    // leaves zero usable scopes after filtering. better-auth treats an empty scope
    // as "no scopes requested" (not "use the default"), so the token would be
    // issued with an empty scope string and every MCP tool would then fail with
    // INSUFFICIENT_SCOPE. Fall back to the default set when no functional anon.li
    // scope survives; deliberate narrowing (e.g. only anon.li:drops) is preserved.
    const hasFunctionalScope = usableScopes.some((requestedScope) => MCP_FUNCTIONAL_SCOPES.includes(requestedScope))
    const scopes = hasFunctionalScope ? usableScopes : [...MCP_OAUTH_SCOPES]

    return Array.from(new Set(scopes)).join(" ")
}

export function normalizeMcpAuthorizationMetadata(metadata: OAuthMetadata | null): OAuthMetadataRecord | null {
    if (!metadata) return null

    const {
        userinfo_endpoint: _userinfoEndpoint,
        jwks_uri: _jwksUri,
        acr_values_supported: _acrValuesSupported,
        subject_types_supported: _subjectTypesSupported,
        id_token_signing_alg_values_supported: _idTokenSigningAlgValuesSupported,
        claims_supported: _claimsSupported,
        ...oauthMetadata
    } = metadata as OAuthMetadataRecord

    return {
        ...oauthMetadata,
        scopes_supported: MCP_OAUTH_SCOPES,
    }
}

export function normalizeMcpProtectedResourceMetadata(metadata: OAuthMetadata | null): OAuthMetadataRecord | null {
    if (!metadata) return null

    const {
        jwks_uri: _jwksUri,
        resource_signing_alg_values_supported: _resourceSigningAlgValuesSupported,
        ...resourceMetadata
    } = metadata as OAuthMetadataRecord

    return {
        ...resourceMetadata,
        scopes_supported: MCP_OAUTH_SCOPES,
    }
}
