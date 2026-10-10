import { auth } from "@/lib/auth"
import { withMcpAuth } from "better-auth/plugins"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { after } from "next/server"
import { instrument } from "@posthog/mcp"
import { registerAllTools } from "@/lib/mcp/register"
import { MCP_SERVER_CAPABILITIES, MCP_SERVER_INFO, MCP_SERVER_INSTRUCTIONS } from "@/lib/mcp/server-card"
import { mcpMethodNotAllowed, mcpPreflightResponse, readJsonRpcBody, withMcpAuthChallenge, withMcpCors } from "@/lib/mcp/http"
import { flushPostHog, getPostHogClient } from "@/lib/posthog.server"
import { createLogger, sanitizeObject } from "@/lib/logger"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const logger = createLogger("McpAnalytics")

const handler = withMcpAuth(auth, async (req, session) => {
    const server = new McpServer(MCP_SERVER_INFO, {
        capabilities: MCP_SERVER_CAPABILITIES,
        instructions: MCP_SERVER_INSTRUCTIONS,
    })

    registerAllTools(server, {
        userId: session.userId,
        clientId: session.clientId,
        scopes: session.scopes,
    })

    // PostHog MCP analytics (@posthog/mcp): auto-captures $mcp_initialize,
    // $mcp_tools_list, $mcp_tool_call and $exception for failed calls. The
    // stateless transport has no protocol session to group by, so identity is
    // the OAuth user — distinct_id groups a person's calls across requests.
    // No-op when PostHog isn't configured. Runs before `connect()` so the
    // instrumentation can wrap the registered tool callbacks and the request
    // handlers it has just installed.
    const posthog = getPostHogClient()
    if (posthog) {
        instrument(server, posthog, {
            identify: { distinctId: session.userId },
            eventProperties: () => ({ oauth_client_id: session.clientId }),
            beforeSend: (event) => {
                // SDK events bypass captureServerEvent's redaction; apply the
                // same sanitization before anything leaves for PostHog.
                event.properties = sanitizeObject(event.properties) as Record<string, unknown>
                return event
            },
            logger: (message) => logger.warn(message),
        })
        // Serverless can freeze before batched events send — flush after the response.
        after(() => flushPostHog())
    }

    const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
    })
    await server.connect(transport)

    // `parsedBody` is the JSON-RPC body with `tools/call` arguments normalized:
    // `arguments` is optional per spec, and the SDK would otherwise validate
    // `undefined` against the tool's input schema and reject a valid call.
    // Reading the body here is safe — the transport only reads it when
    // `parsedBody` is absent — and the same size/batch bounds are applied.
    const body = await readJsonRpcBody(req)
    if (!body.ok) return body.response

    return transport.handleRequest(req, { parsedBody: body.body })
})

/**
 * Origin the protected-resource metadata is served from. Mirrors the base URL
 * better-auth issues tokens for, so the challenge and the metadata document's
 * `resource` agree; falls back to the dialed origin when it is not configured.
 */
function resourceOrigin(req: Request): string {
    const configured = auth.options.baseURL
    if (typeof configured === "string" && configured) return new URL(configured).origin
    return new URL(req.url).origin
}

export async function POST(req: Request) {
    const response = await handler(req)
    return withMcpCors(req, withMcpAuthChallenge(req, response, resourceOrigin(req)))
}

/**
 * Preflight for browser-based MCP clients. The global middleware only grants
 * same-origin CORS, and an agent app's origin is never anon.li's, so this route
 * owns its own preflight.
 */
export function OPTIONS(req: Request) {
    return mcpPreflightResponse(req)
}

/**
 * Stateless transport: no server-initiated stream to attach to (GET) and no
 * session to terminate (DELETE). Handing these to the transport would open an
 * SSE stream that never closes and pin the function for its whole maxDuration,
 * so both answer 405 — which the spec and the SDK's client treat as "not
 * offered", and clients proceed over POST.
 */
export function GET(req: Request) {
    return withMcpCors(req, mcpMethodNotAllowed())
}

export function DELETE(req: Request) {
    return withMcpCors(req, mcpMethodNotAllowed())
}
