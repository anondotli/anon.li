import { auth } from "@/lib/auth"
import { normalizeMcpProtectedResourceMetadata } from "@/lib/mcp/oauth-metadata"
import { mcpDiscoveryCorsHeaders, withDiscoveryCors } from "@/lib/mcp/http"

export const dynamic = "force-dynamic"

/**
 * RFC 9728 protected-resource metadata. This is the document an MCP client
 * reads out of the `WWW-Authenticate: Bearer resource_metadata="..."`
 * challenge to bootstrap OAuth, and RFC 9728 requires it to be CORS-accessible.
 */
export async function GET(request: Request) {
    const metadata = await auth.api.getMCPProtectedResource({ request, asResponse: false })
    return withDiscoveryCors(request, Response.json(normalizeMcpProtectedResourceMetadata(metadata)))
}

export function OPTIONS() {
    return new Response(null, { status: 204, headers: mcpDiscoveryCorsHeaders() })
}
