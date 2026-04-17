import { auth } from "@/lib/auth"
import { withMcpAuth } from "better-auth/plugins"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { registerAllTools } from "@/lib/mcp/register"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const handler = withMcpAuth(auth, async (req, session) => {
    const server = new McpServer(
        { name: "anon.li", version: "1.0.0" },
        { capabilities: { tools: {} } },
    )

    registerAllTools(server, {
        userId: session.userId,
        clientId: session.clientId,
        scopes: session.scopes,
        accessToken: session.accessToken,
    })

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
