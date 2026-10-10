/**
 * RFC 9728 §3.1 path-suffixed form of the protected-resource metadata for the
 * `/api/mcp` resource. MCP clients that do not get a `resource_metadata` hint
 * from the 401 challenge probe this URL before the root one, so it serves the
 * same document instead of a 404.
 */
export { GET, OPTIONS } from "../../route"

export const dynamic = "force-dynamic"
