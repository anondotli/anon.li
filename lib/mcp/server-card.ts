import { SUPPORTED_PROTOCOL_VERSIONS, type Implementation, type ServerCapabilities } from "@modelcontextprotocol/server"
import { siteConfig } from "../../config/site"

export const MCP_SERVER_INFO = {
    name: "anon.li",
    version: "1.0.0",
} satisfies Implementation

/**
 * `listChanged: false`: the tool set is fixed and every request gets a fresh,
 * stateless server, so no `notifications/tools/list_changed` is ever sent.
 * `McpServer` keeps an explicitly configured value, so discovery and
 * `initialize` agree.
 */
export const MCP_SERVER_CAPABILITIES = {
    tools: { listChanged: false },
} satisfies ServerCapabilities

/** The per-request-envelope revision served by `createMcpHandler` (modern leg). */
const MCP_MODERN_PROTOCOL_VERSION = "2026-07-28"

/**
 * Every protocol revision `/api/mcp` negotiates, newest first: the modern
 * revision plus the `initialize`-era revisions the SDK's streamable HTTP
 * transport accepts on the legacy leg.
 */
const MCP_SUPPORTED_PROTOCOL_VERSIONS: readonly string[] = [
    MCP_MODERN_PROTOCOL_VERSION,
    ...SUPPORTED_PROTOCOL_VERSIONS.filter((version) => version !== MCP_MODERN_PROTOCOL_VERSION),
]

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
    "recipients, anon.li:drops covers drops, anon.li:forms covers forms); calling a tool outside the token's scopes is " +
    "refused with an HTTP 403 insufficient_scope challenge naming the scopes to re-authorize with. " +
    "The toggle_* tools set the state you pass (active for aliases, disabled for drops and forms) rather than flipping it. " +
    "The delete tools (delete_alias, delete_drop, delete_form) carry destructiveHint: clients prompt the user for " +
    "approval before running them. A 'No approval received' failure is generated client-side — the request never " +
    "reached this server and nothing was deleted; the user must approve the prompt or allowlist the tool."

/**
 * Absolute, not `/api/mcp`: card readers that resolve the endpoint against the
 * document's own origin get the right answer either way, but a client handed a
 * card copy (or a registry mirror) has no base URL to resolve against and would
 * otherwise dial the wrong host.
 */
const MCP_TRANSPORT_PATH = "/api/mcp"
export const MCP_SERVER_CARD_PATH = "/.well-known/mcp/server-card.json"

const MCP_SERVER_CARD_SCHEMA = "https://static.modelcontextprotocol.io/schemas/mcp-server-card/v1.json"

export function getMcpServerCard(baseUrl = siteConfig.default.url) {
    return {
        $schema: MCP_SERVER_CARD_SCHEMA,
        version: "1.0",
        protocolVersion: MCP_MODERN_PROTOCOL_VERSION,
        supportedProtocolVersions: MCP_SUPPORTED_PROTOCOL_VERSIONS,
        serverInfo: MCP_SERVER_INFO,
        documentationUrl: new URL("/docs/api/mcp", baseUrl).toString(),
        transport: {
            type: "streamable-http",
            endpoint: new URL(MCP_TRANSPORT_PATH, baseUrl).toString(),
        },
        capabilities: MCP_SERVER_CAPABILITIES,
    }
}
