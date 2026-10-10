import { auth } from "@/lib/auth"
import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider"
import { normalizeMcpAuthorizationMetadata } from "@/lib/mcp/oauth-metadata"
import { mcpDiscoveryCorsHeaders, withDiscoveryCors } from "@/lib/mcp/http"

export const dynamic = "force-dynamic"

const serveAuthServerMetadata = oauthProviderAuthServerMetadata(auth)

/**
 * RFC 8414 authorization-server metadata, read by MCP clients during OAuth
 * discovery. The issuer is the bare origin, so this root document is the
 * canonical one. The fetch is cross-origin by definition (the client is the
 * agent app, not anon.li), and browser clients cannot fall back to a
 * server-side read, so this document must be CORS-readable. The global
 * middleware excludes `/.well-known/*`, so the header is set here.
 */
export async function GET(request: Request) {
    const response = await serveAuthServerMetadata(request)
    if (!response.ok) return withDiscoveryCors(request, response)
    const metadata = await response.json() as object
    return withDiscoveryCors(request, Response.json(normalizeMcpAuthorizationMetadata(metadata), {
        headers: { "Cache-Control": response.headers.get("cache-control") ?? "public, max-age=15" },
    }))
}

export function OPTIONS() {
    return new Response(null, { status: 204, headers: mcpDiscoveryCorsHeaders() })
}
