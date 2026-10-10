/**
 * HTTP plumbing for the MCP endpoint (`/api/mcp`).
 *
 * The server runs a *stateless* Streamable HTTP transport: one McpServer and
 * one transport per HTTP request. Several protocol and browser requirements
 * fall outside what the SDK does for us, and each one silently breaks a
 * category of clients when missing:
 *
 *  1. CORS on every response, including the 401 authorization challenge, with
 *     `WWW-Authenticate` *exposed*. Without it a browser-based client (Claude
 *     in the browser, the MCP Inspector) never sees the challenge, so it cannot
 *     discover the OAuth metadata and the connection fails with an opaque
 *     "Failed to fetch".
 *  2. A real `OPTIONS` handler. MCP clients always preflight from another
 *     origin — the agent app's own origin, never anon.li's.
 *  3. `GET` (server→client SSE stream) and `DELETE` (terminate session) are
 *     answered with 405 instead of being fed to the transport. In stateless
 *     mode the transport would open an SSE stream that never ends, pinning a
 *     serverless function for its whole `maxDuration` on every connect.
 *  4. `tools/call` `arguments` is optional in the protocol, but the SDK
 *     validates the *provided* value against the tool's input schema, so an
 *     omitted `arguments` fails with -32602 ("expected object, received
 *     undefined"). The body is normalized here, before the transport sees it.
 *  5. Every 401 carries one RFC 9728 challenge pointing at the path-suffixed
 *     protected-resource metadata, the scopes to request, and — when a bearer
 *     token was presented — `error="invalid_token"` so the client refreshes
 *     instead of starting over (better-auth's `requireMcpAuth` omits it).
 */

import { MCP_DEFAULT_SCOPE, MCP_RESOURCE_PATH, getAppOrigin } from "./oauth-metadata"

/** Mirrors the SDK transport's `maxRequestBodySize` default (4 MiB). */
export const MAX_REQUEST_BODY_BYTES = 4 * 1024 * 1024

/** JSON-RPC batch ceiling, mirrored from the SDK transport. */
const MAX_BATCH_SIZE = 100

const ALLOW_HEADERS = [
    "Authorization",
    "Content-Type",
    "MCP-Protocol-Version",
    "MCP-Session-Id",
    "Last-Event-ID",
].join(", ")

// A client must be able to read the OAuth challenge (to bootstrap discovery)
// and the session id cross-origin; browsers hide every other header by default.
const EXPOSE_HEADERS = ["WWW-Authenticate", "MCP-Session-Id", "Allow", "Content-Type"].join(", ")

/**
 * CORS headers for one MCP response. The origin is echoed rather than `*` so
 * the endpoint stays compatible with a future credentialed transport, and
 * `Vary: Origin` keeps shared caches from mixing variants. Requests without an
 * `Origin` (curl, desktop CLIs, most agent runtimes) need no CORS headers.
 */
function mcpCorsHeaders(request: Request): Record<string, string> {
    const origin = request.headers.get("origin")
    if (!origin) return {}
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "false",
        "Access-Control-Expose-Headers": EXPOSE_HEADERS,
        Vary: "Origin",
    }
}

/** Add CORS headers to a response produced by the auth or transport layer. */
export function withMcpCors(request: Request, response: Response): Response {
    const headers = new Headers(response.headers)
    for (const [key, value] of Object.entries(mcpCorsHeaders(request))) {
        headers.set(key, value)
    }
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    })
}

/**
 * Answer the CORS preflight for `POST /api/mcp`. The global middleware only
 * blesses same-origin preflights, so this route owns the cross-origin case.
 */
export function mcpPreflightResponse(request: Request): Response {
    const cors = mcpCorsHeaders(request)
    return new Response(null, {
        status: 204,
        headers: {
            ...cors,
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": ALLOW_HEADERS,
            "Access-Control-Max-Age": "86400",
        },
    })
}

/**
 * `GET`/`DELETE` are deliberately not offered: a stateless server has no
 * session to terminate and no server-initiated stream to multiplex onto. The
 * MCP spec and the SDK's own client both treat 405 as the expected answer.
 */
export function mcpMethodNotAllowed(): Response {
    return jsonRpcError(405, -32000, "Method Not Allowed: this stateless endpoint offers no SSE stream and no session to terminate", {
        Allow: "POST, OPTIONS",
    })
}

/** RFC 9728 §3.1 path-suffixed protected-resource metadata for the `/api/mcp` resource. */
const MCP_PROTECTED_RESOURCE_METADATA_PATH = `/.well-known/oauth-protected-resource${MCP_RESOURCE_PATH}`

/**
 * Absolute URL of the protected-resource metadata, stamped onto the verified
 * `AuthInfo` so the SDK's per-tool `403 insufficient_scope` challenges point
 * at the same document as the 401 challenge below.
 */
export function getMcpProtectedResourceMetadataUrl(): string {
    return new URL(MCP_PROTECTED_RESOURCE_METADATA_PATH, getAppOrigin()).toString()
}

/**
 * `WWW-Authenticate` value for a rejected MCP request (RFC 6750 + RFC 9728).
 * `scope` tells the client what to request up front (MCP authorization spec),
 * and `error="invalid_token"` distinguishes an expired/revoked token — which a
 * client answers with a refresh — from a request that carried no token.
 */
function mcpAuthChallenge(resourceOrigin: string, hadToken: boolean): string {
    const metadataUrl = new URL(MCP_PROTECTED_RESOURCE_METADATA_PATH, resourceOrigin).toString()
    const params = [`resource_metadata="${metadataUrl}"`, `scope="${MCP_DEFAULT_SCOPE}"`]
    if (hadToken) {
        params.push(`error="invalid_token"`, `error_description="The access token is invalid or expired"`)
    }
    return `Bearer ${params.join(", ")}`
}

/** The 401 every unauthenticated or rejected MCP request receives. */
export function mcpUnauthorizedResponse(request: Request): Response {
    const hadToken = /^(bearer|dpop)\s+\S/i.test(request.headers.get("authorization") ?? "")
    return jsonRpcError(401, -32000, "Unauthorized: Authentication required", {
        "WWW-Authenticate": mcpAuthChallenge(getAppOrigin(), hadToken),
    })
}

/**
 * Replace the auth layer's bearer 401 with the challenge above; other
 * responses (including DPoP challenges, which carry their own scheme) pass
 * through.
 */
export function withMcpAuthChallenge(request: Request, response: Response): Response {
    if (response.status !== 401) return response
    if (/^dpop\b/i.test(response.headers.get("www-authenticate") ?? "")) return response
    return mcpUnauthorizedResponse(request)
}

/** 415 for POSTs whose media type is not JSON (checked before the body is read). */
export function mcpUnsupportedMediaType(): Response {
    return jsonRpcError(415, -32000, "Unsupported Media Type: Content-Type must be application/json")
}

function jsonRpcError(status: number, code: number, message: string, extraHeaders: Record<string, string> = {}): Response {
    return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }), {
        status,
        headers: { "Content-Type": "application/json", ...extraHeaders },
    })
}

/**
 * CORS for the public OAuth/discovery documents (`/.well-known/*`). Those are
 * unreadable by a browser-based MCP client without `Access-Control-Allow-Origin`,
 * and they contain no user data, so `*` is correct — no `Vary` and no cached
 * per-origin variants.
 */
export function mcpDiscoveryCorsHeaders(): Record<string, string> {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, MCP-Protocol-Version",
        "Access-Control-Max-Age": "86400",
    }
}

/** Attach discovery CORS headers to a response. */
export function withDiscoveryCors(request: Request, response: Response): Response {
    void request
    const headers = new Headers(response.headers)
    for (const [key, value] of Object.entries(mcpDiscoveryCorsHeaders())) {
        headers.set(key, value)
    }
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    })
}

/**
 * `tools/call` arguments are optional per protocol. Fill in `{}` so the SDK
 * validates an object (applying every schema default) instead of rejecting
 * `undefined`. Applies to single requests and batches.
 */
function withDefaultToolArguments<T>(message: T): T {
    if (Array.isArray(message)) {
        return message.map((item) => withDefaultToolArguments(item)) as unknown as T
    }
    if (!message || typeof message !== "object") return message

    const record = message as Record<string, unknown>
    if (record.method !== "tools/call") return message

    const params = record.params
    if (!params || typeof params !== "object" || Array.isArray(params)) return message
    const existing = (params as Record<string, unknown>).arguments
    // Treat an explicit null the same as an absent value: the JSON-RPC message
    // schema requires an object, so leaving it would 400 the whole request.
    if (existing !== undefined && existing !== null) return message

    return {
        ...record,
        params: { ...(params as Record<string, unknown>), arguments: {} },
    } as T
}

export type JsonRpcBody =
    | { ok: true; body: unknown }
    | { ok: false; response: Response }

/**
 * Read and normalize the JSON-RPC body once so it can be handed to the
 * transport as `parsedBody`. Supplying `parsedBody` skips the transport's own
 * size and batch guards, so they are enforced here with the same bounds.
 */
export async function readJsonRpcBody(request: Request): Promise<JsonRpcBody> {
    const declaredLength = Number(request.headers.get("content-length"))
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BODY_BYTES) {
        return { ok: false, response: jsonRpcError(413, -32000, `Payload Too Large: Request body must not exceed ${MAX_REQUEST_BODY_BYTES} bytes`) }
    }

    const text = await request.text().catch(() => "")
    if (new TextEncoder().encode(text).length > MAX_REQUEST_BODY_BYTES) {
        return { ok: false, response: jsonRpcError(413, -32000, `Payload Too Large: Request body must not exceed ${MAX_REQUEST_BODY_BYTES} bytes`) }
    }

    let parsed: unknown
    try {
        parsed = JSON.parse(text)
    } catch {
        return { ok: false, response: jsonRpcError(400, -32700, "Parse error: Invalid JSON") }
    }

    if (Array.isArray(parsed) && parsed.length > MAX_BATCH_SIZE) {
        return { ok: false, response: jsonRpcError(400, -32600, `Invalid Request: Batch must not exceed ${MAX_BATCH_SIZE} messages`) }
    }

    return { ok: true, body: withDefaultToolArguments(parsed) }
}
