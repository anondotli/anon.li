import { auth } from "@/lib/auth"
import { normalizeMcpRequestedScope } from "@/lib/mcp/oauth-metadata"
import { toNextJsHandler } from "better-auth/next-js"

const authHandlers = toNextJsHandler(auth)

function isMcpAuthorizeRequest(request: Request): boolean {
    return new URL(request.url).pathname === "/api/auth/mcp/authorize"
}

function isMcpTokenRequest(request: Request): boolean {
    return new URL(request.url).pathname === "/api/auth/mcp/token"
}

function withNormalizedMcpScope(request: Request): Request {
    const url = new URL(request.url)
    url.searchParams.set("scope", normalizeMcpRequestedScope(url.searchParams.get("scope")))

    return new Request(url, {
        method: request.method,
        headers: request.headers,
        redirect: request.redirect,
        signal: request.signal,
    })
}

async function withoutMcpIdToken(response: Response): Promise<Response> {
    const contentType = response.headers.get("content-type")
    if (!contentType?.includes("application/json")) return response

    const body = await response.clone().json().catch(() => null) as unknown
    if (!body || typeof body !== "object" || !("id_token" in body)) return response

    const { id_token: _idToken, ...tokenResponse } = body as Record<string, unknown>
    if (typeof tokenResponse.scope === "string") {
        tokenResponse.scope = normalizeMcpRequestedScope(tokenResponse.scope)
    }

    const headers = new Headers(response.headers)
    headers.delete("content-length")

    return Response.json(tokenResponse, {
        status: response.status,
        statusText: response.statusText,
        headers,
    })
}

export function GET(request: Request) {
    return authHandlers.GET(isMcpAuthorizeRequest(request) ? withNormalizedMcpScope(request) : request)
}

export async function POST(request: Request) {
    const response = await authHandlers.POST(request)
    return isMcpTokenRequest(request) ? withoutMcpIdToken(response) : response
}
