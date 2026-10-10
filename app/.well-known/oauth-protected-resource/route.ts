import { auth } from "@/lib/auth"
import { mcpDiscoveryCorsHeaders, withDiscoveryCors } from "@/lib/mcp/http"

export const dynamic = "force-dynamic"

/**
 * RFC 9728 protected-resource metadata. This is the document an MCP client
 * reads out of the `WWW-Authenticate: Bearer resource_metadata="..."`
 * challenge to bootstrap OAuth, and RFC 9728 requires it to be CORS-accessible.
 * better-auth's `mcp()` plugin serves it from `auth.handler` for both the root
 * and the path-suffixed (`/api/mcp`) URL: `resource` is the canonical MCP
 * resource and only the anon.li tool scopes are listed.
 */
export async function GET(request: Request) {
    return withDiscoveryCors(request, await auth.handler(request))
}

export function OPTIONS() {
    return new Response(null, { status: 204, headers: mcpDiscoveryCorsHeaders() })
}
