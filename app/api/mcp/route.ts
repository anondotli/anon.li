import { auth } from "@/lib/auth"
import { withMcpAuth } from "better-auth/plugins"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { after } from "next/server"
import { instrument } from "@posthog/mcp"
import { registerAllTools } from "@/lib/mcp/register"
import { MCP_SERVER_CAPABILITIES, MCP_SERVER_INFO, MCP_SERVER_INSTRUCTIONS } from "@/lib/mcp/server-card"
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
    // No-op when PostHog isn't configured.
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
    return transport.handleRequest(req)
})

export const GET = handler
export const POST = handler
export const DELETE = handler
