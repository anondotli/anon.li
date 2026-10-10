import { API_CATALOG_PROFILE, getApiCatalogDocument } from "@/config/agent-discovery"
import { mcpDiscoveryCorsHeaders } from "@/lib/mcp/http"

export const revalidate = 3600

/**
 * RFC 9727 linkset that points agents at the MCP server card and OAuth
 * metadata. It is the entry point of the discovery chain and is fetched
 * cross-origin by browser-based clients, so it needs CORS; the global
 * middleware excludes `/.well-known/*`.
 */
export function GET() {
    return new Response(JSON.stringify(getApiCatalogDocument()), {
        headers: {
            "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
            "Content-Type": `application/linkset+json; profile="${API_CATALOG_PROFILE}"`,
            ...mcpDiscoveryCorsHeaders(),
        },
    })
}

export function OPTIONS() {
    return new Response(null, { status: 204, headers: mcpDiscoveryCorsHeaders() })
}
