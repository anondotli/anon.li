import { LATEST_PROTOCOL_VERSION, type Implementation, type ServerCapabilities } from "@modelcontextprotocol/sdk/types.js"
import { siteConfig } from "../../config/site"

export const MCP_SERVER_INFO = {
    name: "anon.li",
    version: "1.0.0",
} satisfies Implementation

export const MCP_SERVER_CAPABILITIES = {
    tools: {},
} satisfies ServerCapabilities

/**
 * Sent in the `initialize` response to orient the agent: this server is a
 * control plane only — the content plane is end-to-end encrypted and never
 * reachable here.
 */
export const MCP_SERVER_INSTRUCTIONS =
    "anon.li manages the control plane of a privacy account: email aliases, their forwarding recipients, " +
    "end-to-end encrypted file drops, and encrypted forms. Use these tools to list, create, toggle, and delete " +
    "those objects. The content plane is zero-knowledge and is never readable through this server — alias labels " +
    "and notes, drop file contents and filenames, and form submission data are all encrypted client-side with keys " +
    "anon.li does not hold. Do not attempt to read protected content here; direct the user to the web UI or CLI " +
    "(which hold their vault key) for that. Tools enforce OAuth scopes (anon.li:aliases covers aliases and " +
    "recipients, anon.li:drops covers drops, anon.li:forms covers forms); a missing scope returns INSUFFICIENT_SCOPE."

const MCP_TRANSPORT_ENDPOINT = "/api/mcp"
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
