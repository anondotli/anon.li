import { auth } from "@/lib/auth"
import { requireMcpAuth } from "@better-auth/mcp"
import {
    McpServer,
    WebStandardStreamableHTTPServerTransport,
    createMcpHandler,
    isJsonContentType,
    isLegacyRequest,
    type AuthInfo,
} from "@modelcontextprotocol/server"
import { after } from "next/server"
import { instrument } from "@posthog/mcp"
import { registerAllTools } from "@/lib/mcp/register"
import { MCP_SERVER_CAPABILITIES, MCP_SERVER_INFO, MCP_SERVER_INSTRUCTIONS } from "@/lib/mcp/server-card"
import {
    MAX_REQUEST_BODY_BYTES,
    mcpMethodNotAllowed,
    mcpPreflightResponse,
    mcpUnauthorizedResponse,
    mcpUnsupportedMediaType,
    getMcpProtectedResourceMetadataUrl,
    readJsonRpcBody,
    withMcpAuthChallenge,
    withMcpCors,
} from "@/lib/mcp/http"
import { isMcpGrantActive, mcpSessionFromClaims, tokenIssuedAt } from "@/lib/mcp/auth"
import { MCP_OAUTH_SCOPES, getMcpIssuer, getMcpJwksUrl, getMcpResource } from "@/lib/mcp/oauth-metadata"
import type { McpSession } from "@/lib/mcp/types"
import { flushPostHog, getPostHogClient } from "@/lib/posthog.server"
import { createLogger } from "@/lib/logger"
import { logMcpAnalytics, scrubMcpAnalyticsEvent } from "@/lib/mcp/analytics-log"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const logger = createLogger("MCP")

/** One fresh server per HTTP request, serving both protocol eras from the same tool set. */
function buildServer(session: McpSession): McpServer {
    const server = new McpServer(MCP_SERVER_INFO, {
        capabilities: MCP_SERVER_CAPABILITIES,
        instructions: MCP_SERVER_INSTRUCTIONS,
    })

    registerAllTools(server, session)

    // PostHog MCP analytics (@posthog/mcp, SDK v1 and v2 compatible): auto-captures
    // $mcp_initialize, $mcp_tools_list, $mcp_tool_call and $exception for failed
    // calls. There is no protocol session to group by, so identity is the OAuth
    // user — distinct_id groups a person's calls across requests. No-op when
    // PostHog isn't configured. Runs before the transport connects so the
    // instrumentation can wrap the registered tool callbacks and handlers.
    //
    // Analytics must never change the protocol surface or carry account data:
    //  - context/enableConversationId/captureModel off: each injects an extra
    //    parameter (a *required* `context`, `conversation_id`, `llm_model`)
    //    into every tool's inputSchema.
    //  - $mcp_parameters/$mcp_response are dropped: tool arguments and results
    //    hold alias addresses and recipient emails.
    const posthog = getPostHogClient()
    if (posthog) {
        instrument(server, posthog, {
            identify: { distinctId: session.userId },
            context: false,
            enableConversationId: false,
            captureModel: false,
            // Not `*_client_id`: the logger's redaction blanks any key matching /auth/.
            eventProperties: () => ({ mcp_client: session.clientId }),
            beforeSend: scrubMcpAnalyticsEvent,
            logger: logMcpAnalytics,
        })
    }

    return server
}

function sessionFromAuthInfo(authInfo: AuthInfo | undefined): McpSession {
    const userId = authInfo?.extra?.userId
    if (!authInfo || typeof userId !== "string") {
        // Unreachable: the modern leg is only invoked with verified authInfo.
        throw new Error("MCP request reached the server without verified auth")
    }
    return { userId, clientId: authInfo.clientId, scopes: authInfo.scopes.join(" ") }
}

/**
 * MCP 2026-07-28 (per-request envelope) traffic. `legacy: "reject"` keeps this
 * handler modern-only; 2025-era traffic is routed to the legacy leg below.
 * The default `auto` response mode upgrades to SSE only when a handler emits a
 * message before its result; tools emit none, so every response is a single
 * JSON body. (`responseMode: "json"` would behave the same but makes the SDK
 * console.warn on every cold start.) `subscriptions/listen` closes right after
 * its ack: no capability it could subscribe to is advertised.
 */
const modernHandler = createMcpHandler(({ authInfo }) => buildServer(sessionFromAuthInfo(authInfo)), {
    legacy: "reject",
    maxRequestBodySize: MAX_REQUEST_BODY_BYTES,
    onerror: (error) => logger.warn("MCP modern handler error", { error: error.message }),
})

/**
 * 2025-era traffic (2025-03-26 / 2025-06-18 / 2025-11-25 — what claude.ai,
 * Claude Code, Cursor and the Inspector speak today): a stateless streamable
 * HTTP transport with JSON responses, exactly as before the SDK v2 upgrade.
 * JSON mode also lets @posthog/mcp mint its `Mcp-Session-Id` token at
 * `initialize`, which the SDK's own stateless fallback cannot.
 */
async function serveLegacy(req: Request, session: McpSession, parsedBody: unknown, authInfo: AuthInfo): Promise<Response> {
    const server = buildServer(session)
    const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
    })
    // connect() installs the per-tool scope-challenge resolver on the transport;
    // it needs `authInfo` to answer a missing scope with 403 insufficient_scope.
    await server.connect(transport)
    return transport.handleRequest(req, { parsedBody, authInfo })
}

function bearerToken(req: Request): string {
    return (req.headers.get("authorization") ?? "").replace(/^\S+\s+/, "")
}

/** Verified token info for both legs (drives the SDK's per-tool scope challenges). */
function authInfoFor(req: Request, session: McpSession): AuthInfo {
    return {
        token: bearerToken(req),
        clientId: session.clientId,
        scopes: (session.scopes ?? "").split(/\s+/).filter(Boolean),
        resourceMetadataUrl: getMcpProtectedResourceMetadataUrl(),
        extra: { userId: session.userId },
    }
}

const handler = requireMcpAuth(auth, async (req, claims) => {
    const session = mcpSessionFromClaims(claims)
    // JWTs verify statelessly; a disabled or deleted client, or a grant the
    // user revoked in Settings → Connected apps, is cut off here.
    if (!session || !(await isMcpGrantActive(session, tokenIssuedAt(claims)))) return mcpUnauthorizedResponse(req)

    if (!isJsonContentType(req.headers.get("content-type"))) return mcpUnsupportedMediaType()

    // `parsedBody` is the JSON-RPC body with `tools/call` arguments normalized
    // (`arguments` is optional per spec) and the transport's size/batch bounds
    // applied. Both legs skip their own body read when it is supplied.
    const body = await readJsonRpcBody(req)
    if (!body.ok) return body.response

    // Serverless can freeze before batched events send — flush after the response.
    if (getPostHogClient()) after(() => flushPostHog())

    const authInfo = authInfoFor(req, session)
    if (await isLegacyRequest(req, body.body)) {
        return serveLegacy(req, session, body.body, authInfo)
    }

    return modernHandler.fetch(req, { parsedBody: body.body, authInfo })
}, {
    // Tokens must be audience-bound to this endpoint and issued by our origin.
    resource: getMcpResource(),
    issuer: getMcpIssuer(),
    jwksUrl: getMcpJwksUrl(),
    challengeScopes: [...MCP_OAUTH_SCOPES],
})

export async function POST(req: Request) {
    const response = await handler(req)
    return withMcpCors(req, withMcpAuthChallenge(req, response))
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
 * session to terminate (DELETE). Kept as explicit 405s (with CORS and a
 * JSON-RPC body) rather than omitted exports, which the spec and the SDK
 * clients treat as "not offered" so they proceed over POST.
 */
export function GET(req: Request) {
    return withMcpCors(req, mcpMethodNotAllowed())
}

export function DELETE(req: Request) {
    return withMcpCors(req, mcpMethodNotAllowed())
}
