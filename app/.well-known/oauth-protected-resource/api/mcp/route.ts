/**
 * RFC 9728 §3.1 path-suffixed form of the protected-resource metadata for the
 * `/api/mcp` resource — the URL the MCP endpoint's 401 challenge points at,
 * and the one clients without a `resource_metadata` hint probe first. Same
 * document as the root URL.
 */
export { GET, OPTIONS } from "../../route"

export const dynamic = "force-dynamic"
