import { LATEST_PROTOCOL_VERSION, type Implementation, type ServerCapabilities } from "@modelcontextprotocol/sdk/types.js"
import { siteConfig } from "../../config/site"

export const MCP_SERVER_INFO = {
    name: "anon.li",
    version: "1.0.0",
} satisfies Implementation

export const MCP_SERVER_CAPABILITIES = {
    tools: {},
} satisfies ServerCapabilities

export const MCP_TRANSPORT_ENDPOINT = "/api/mcp"
export const MCP_SERVER_CARD_PATH = "/.well-known/mcp/server-card.json"

const MCP_SERVER_CARD_SCHEMA = "https://static.modelcontextprotocol.io/schemas/mcp-server-card/v1.json"

export function getMcpServerCard(baseUrl = siteConfig.default.url) {
    return {
        $schema: MCP_SERVER_CARD_SCHEMA,
        version: "1.0",
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: MCP_SERVER_INFO,
        documentationUrl: new URL("/docs/api/mcp", baseUrl).toString(),
        transport: {
            type: "streamable-http",
            endpoint: MCP_TRANSPORT_ENDPOINT,
        },
        capabilities: MCP_SERVER_CAPABILITIES,
    }
}
