import { auth } from "@/lib/auth"
import { normalizeMcpClientRegistration } from "@/lib/mcp/client-registration"
import {
    OAUTH_AUTHORIZE_PATH,
    OAUTH_REGISTER_PATH,
    OAUTH_REVOKE_PATH,
    OAUTH_TOKEN_PATH,
    adaptImportedClientAuthentication,
    normalizeMcpAuthorizeParams,
    normalizeMcpTokenParams,
    rewriteLegacyMcpOAuthPath,
} from "@/lib/mcp/oauth-request"
import { toNextJsHandler } from "better-auth/next-js"

const authHandlers = toNextJsHandler(auth)

function withBody(request: Request, url: URL, body: string, headers: Headers = request.headers): Request {
    const nextHeaders = new Headers(headers)
    nextHeaders.delete("content-length")
    return new Request(url, { method: request.method, headers: nextHeaders, body, signal: request.signal })
}

export function GET(request: Request) {
    const original = new URL(request.url)
    const url = rewriteLegacyMcpOAuthPath(original)

    if (url.pathname === OAUTH_AUTHORIZE_PATH) {
        // Every MCP authorization is forced through the consent screen
        // (prompt=consent), scoped to anon.li scopes and bound to the MCP
        // resource — see normalizeMcpAuthorizeParams. Done here rather than in
        // a before-hook because the consent endpoint re-dispatches authorize
        // through the hooks once the user has approved.
        url.search = normalizeMcpAuthorizeParams(url.searchParams).toString()
    } else if (url === original) {
        return authHandlers.GET(request)
    }

    return authHandlers.GET(new Request(url, { method: "GET", headers: request.headers, signal: request.signal }))
}

export async function POST(request: Request) {
    const original = new URL(request.url)
    const url = rewriteLegacyMcpOAuthPath(original)

    switch (url.pathname) {
        case OAUTH_AUTHORIZE_PATH:
            // better-auth 1.7 also accepts form-encoded authorize POSTs; only the
            // GET form is normalized (forced consent), so POST is not offered.
            return Response.json(
                { error: "invalid_request", error_description: "Use GET for the authorization endpoint" },
                { status: 405, headers: { Allow: "GET" } },
            )
        case OAUTH_REGISTER_PATH: {
            const text = await request.text()
            let body: unknown
            try {
                body = JSON.parse(text)
            } catch {
                return authHandlers.POST(withBody(request, url, text))
            }
            return authHandlers.POST(withBody(request, url, JSON.stringify(normalizeMcpClientRegistration(body))))
        }
        case OAUTH_TOKEN_PATH:
        case OAUTH_REVOKE_PATH: {
            const contentType = request.headers.get("content-type") ?? ""
            if (!contentType.toLowerCase().includes("application/x-www-form-urlencoded")) break
            const form = new URLSearchParams(await request.text())
            const normalized = url.pathname === OAUTH_TOKEN_PATH ? normalizeMcpTokenParams(form) : form
            const adapted = await adaptImportedClientAuthentication(normalized, request.headers)
            return authHandlers.POST(withBody(request, url, adapted.params.toString(), adapted.headers))
        }
    }

    if (url === original) return authHandlers.POST(request)
    return authHandlers.POST(withBody(request, url, await request.text()))
}
