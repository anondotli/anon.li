export const MCP_OAUTH_SCOPES = [
    "anon.li:aliases",
    "anon.li:drops",
    "offline_access",
] as const

export const MCP_DEFAULT_SCOPE = MCP_OAUTH_SCOPES.join(" ")

type OAuthMetadata = Record<string, unknown>

export function normalizeMcpAuthorizationMetadata(metadata: OAuthMetadata | null): OAuthMetadata | null {
    if (!metadata) return null

    const {
        userinfo_endpoint: _userinfoEndpoint,
        jwks_uri: _jwksUri,
        acr_values_supported: _acrValuesSupported,
        subject_types_supported: _subjectTypesSupported,
        id_token_signing_alg_values_supported: _idTokenSigningAlgValuesSupported,
        claims_supported: _claimsSupported,
        ...oauthMetadata
    } = metadata

    return {
        ...oauthMetadata,
        scopes_supported: MCP_OAUTH_SCOPES,
    }
}

export function normalizeMcpProtectedResourceMetadata(metadata: OAuthMetadata | null): OAuthMetadata | null {
    if (!metadata) return null

    const {
        jwks_uri: _jwksUri,
        resource_signing_alg_values_supported: _resourceSigningAlgValuesSupported,
        ...resourceMetadata
    } = metadata

    return {
        ...resourceMetadata,
        scopes_supported: MCP_OAUTH_SCOPES,
    }
}
