import { auth } from "@/lib/auth"
import { normalizeMcpAuthorizationMetadata } from "@/lib/mcp/oauth-metadata"
import { mcpDiscoveryCorsHeaders, withDiscoveryCors } from "@/lib/mcp/http"

export const dynamic = "force-dynamic"

/**
 * RFC 8414 authorization-server metadata, read by MCP clients during OAuth
 * discovery. The fetch is cross-origin by definition (the client is the agent
 * app, not anon.li), and browser clients cannot fall back to a server-side
 * read, so this document must be CORS-readable. The global middleware excludes
 * `/.well-known/*`, so the header is set here.
 */
export async function GET(request: Request) {
    const metadata = await auth.api.getMcpOAuthConfig({ request, asResponse: false })
    return withDiscoveryCors(request, Response.json(normalizeMcpAuthorizationMetadata(metadata)))
}

export function OPTIONS() {
    return new Response(null, { status: 204, headers: mcpDiscoveryCorsHeaders() })
}
