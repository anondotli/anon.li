export const MCP_OAUTH_SCOPES = [
    "anon.li:aliases",
    "anon.li:drops",
    "offline_access",
] as const

export const MCP_DEFAULT_SCOPE = MCP_OAUTH_SCOPES.join(" ")

const MCP_OIDC_COMPATIBILITY_SCOPES = new Set(["openid", "profile", "email"])

type OAuthMetadata = object
type OAuthMetadataRecord = Record<string, unknown>

export function normalizeMcpRequestedScope(scope: string | null | undefined): string {
    const requestedScopes = (scope?.trim() ? scope : MCP_DEFAULT_SCOPE).split(/\s+/).filter(Boolean)
    const oauthScopes = requestedScopes.filter((requestedScope) => !MCP_OIDC_COMPATIBILITY_SCOPES.has(requestedScope))

    return Array.from(new Set(oauthScopes)).join(" ")
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
