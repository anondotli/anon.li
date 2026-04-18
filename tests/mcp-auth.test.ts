/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const getMcpOAuthConfig = vi.fn()
const getMCPProtectedResource = vi.fn()
const nextAuthHandlers = vi.hoisted(() => {
    const GET = vi.fn()
    const POST = vi.fn()
    const toNextJsHandler = vi.fn(() => ({ GET, POST }))

    return { GET, POST, toNextJsHandler }
})

vi.mock("better-auth/next-js", () => ({
    toNextJsHandler: nextAuthHandlers.toNextJsHandler,
}))

vi.mock("@/lib/auth", () => ({
    auth: {
        api: {
            getMcpOAuthConfig,
            getMCPProtectedResource,
        },
    },
}))

describe("/api/auth MCP OAuth endpoints", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        nextAuthHandlers.GET.mockImplementation(async (request: Request) => Response.json({ delegatedUrl: request.url }))
        nextAuthHandlers.POST.mockResolvedValue(Response.json({ ok: true }))
    })

    it("strips OIDC-only scopes before delegating MCP authorize requests", async () => {
        const { GET } = await import("@/app/api/auth/[...all]/route")
        const response = await GET(new Request(
            "https://anon.li/api/auth/mcp/authorize?client_id=client-1&scope=openid%20profile%20anon.li%3Aaliases%20offline_access",
        ))
        const body = await response.json() as { delegatedUrl: string }
        const delegatedUrl = new URL(body.delegatedUrl)

        expect(delegatedUrl.pathname).toBe("/api/auth/mcp/authorize")
        expect(delegatedUrl.searchParams.get("scope")).toBe("anon.li:aliases offline_access")
    })

    it("removes unverifiable id_token values from MCP token responses", async () => {
        nextAuthHandlers.POST.mockResolvedValueOnce(Response.json({
            access_token: "access-token",
            token_type: "Bearer",
            expires_in: 3600,
            refresh_token: "refresh-token",
            scope: "openid profile email anon.li:aliases offline_access",
            id_token: "header.payload.signature",
        }, {
            headers: {
                "Cache-Control": "no-store",
                Pragma: "no-cache",
            },
        }))

        const { POST } = await import("@/app/api/auth/[...all]/route")
        const response = await POST(new Request("https://anon.li/api/auth/mcp/token", { method: "POST" }))
        const body = await response.json()

        expect(body).toEqual({
            access_token: "access-token",
            token_type: "Bearer",
            expires_in: 3600,
            refresh_token: "refresh-token",
            scope: "anon.li:aliases offline_access",
        })
        expect(response.headers.get("cache-control")).toBe("no-store")
        expect(response.headers.get("pragma")).toBe("no-cache")
    })
})

describe("/.well-known/oauth-authorization-server", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        getMcpOAuthConfig.mockResolvedValue({
            issuer: "https://anon.li",
            authorization_endpoint: "https://anon.li/api/auth/mcp/authorize",
            token_endpoint: "https://anon.li/api/auth/mcp/token",
            userinfo_endpoint: "https://anon.li/api/auth/mcp/userinfo",
            jwks_uri: "https://anon.li/api/auth/mcp/jwks",
            registration_endpoint: "https://anon.li/api/auth/mcp/register",
            scopes_supported: ["openid", "profile", "email", "offline_access"],
            response_types_supported: ["code"],
            grant_types_supported: ["authorization_code", "refresh_token"],
            code_challenge_methods_supported: ["S256"],
            id_token_signing_alg_values_supported: ["RS256", "none"],
            token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"],
        })
    })

    it("returns the OAuth discovery document with required RFC 8414 fields", async () => {
        const { GET } = await import("@/app/.well-known/oauth-authorization-server/route")
        const response = await GET(new Request("https://anon.li/.well-known/oauth-authorization-server"))
        expect(response.status).toBe(200)
        expect(response.headers.get("content-type")).toContain("application/json")

        const body = await response.json()
        expect(body.authorization_endpoint).toMatch(/\/mcp\/authorize$/)
        expect(body.token_endpoint).toMatch(/\/mcp\/token$/)
        expect(body.registration_endpoint).toMatch(/\/mcp\/register$/)
        expect(body.scopes_supported).toEqual(["anon.li:aliases", "anon.li:drops", "offline_access"])
        expect(body.id_token_signing_alg_values_supported).toBeUndefined()
        expect(body.userinfo_endpoint).toBeUndefined()
        expect(body.jwks_uri).toBeUndefined()
        expect(body.code_challenge_methods_supported).toEqual(["S256"])
        expect(body.grant_types_supported).toEqual(
            expect.arrayContaining(["authorization_code", "refresh_token"]),
        )
        expect(body.response_types_supported).toEqual(expect.arrayContaining(["code"]))
    })

    it("delegates to auth.api.getMcpOAuthConfig with the incoming request", async () => {
        const { GET } = await import("@/app/.well-known/oauth-authorization-server/route")
        const req = new Request("https://anon.li/.well-known/oauth-authorization-server")
        await GET(req)
        expect(getMcpOAuthConfig).toHaveBeenCalledWith({ request: req, asResponse: false })
    })
})

describe("/.well-known/oauth-protected-resource", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        getMCPProtectedResource.mockResolvedValue({
            resource: "https://anon.li",
            authorization_servers: ["https://anon.li"],
            scopes_supported: ["openid", "profile", "email", "offline_access"],
            bearer_methods_supported: ["header"],
            jwks_uri: "https://anon.li/api/auth/mcp/jwks",
            resource_signing_alg_values_supported: ["RS256", "none"],
        })
    })

    it("returns the protected-resource metadata RFC 9728 document", async () => {
        const { GET } = await import("@/app/.well-known/oauth-protected-resource/route")
        const response = await GET(new Request("https://anon.li/.well-known/oauth-protected-resource"))
        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.resource).toBe("https://anon.li")
        expect(body.authorization_servers).toEqual(["https://anon.li"])
        expect(body.scopes_supported).toEqual(["anon.li:aliases", "anon.li:drops", "offline_access"])
        expect(body.jwks_uri).toBeUndefined()
        expect(body.resource_signing_alg_values_supported).toBeUndefined()
        expect(body.bearer_methods_supported).toContain("header")
    })
})
