/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

process.env.NEXT_PUBLIC_APP_URL = "https://anon.li"

const getOAuthServerMetadata = vi.fn()
const authHandler = vi.fn()
const findOauthClient = vi.fn()
const nextAuthHandlers = vi.hoisted(() => {
    const GET = vi.fn()
    const POST = vi.fn()
    const toNextJsHandler = vi.fn(() => ({ GET, POST }))

    return { GET, POST, toNextJsHandler }
})

vi.mock("better-auth/next-js", () => ({
    toNextJsHandler: nextAuthHandlers.toNextJsHandler,
}))

vi.mock("@better-auth/oauth-provider", () => ({
    oauthProviderAuthServerMetadata: () => getOAuthServerMetadata,
}))

vi.mock("@/lib/auth", () => ({
    auth: { handler: authHandler },
}))

vi.mock("@/lib/prisma", () => ({
    prisma: { oauthClient: { findUnique: findOauthClient } },
}))

interface Delegated {
    url: string
    method: string
    body: string
    authorization: string | null
}

async function delegated(response: Response): Promise<Delegated> {
    return await response.json() as Delegated
}

function form(values: Record<string, string>): RequestInit {
    return {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(values).toString(),
    }
}

describe("/api/auth OAuth provider boundary (better-auth 1.7)", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        const echo = async (request: Request) => Response.json({
            url: request.url,
            method: request.method,
            body: request.method === "GET" ? "" : await request.text(),
            authorization: request.headers.get("authorization"),
        })
        nextAuthHandlers.GET.mockImplementation(echo)
        nextAuthHandlers.POST.mockImplementation(echo)
        findOauthClient.mockResolvedValue(null)
    })

    it("forces consent, strips OIDC scopes and binds the MCP resource on authorize", async () => {
        const { GET } = await import("@/app/api/auth/[...all]/route")
        const response = await GET(new Request(
            "https://anon.li/api/auth/oauth2/authorize?client_id=client-1&scope=openid%20profile%20anon.li%3Aaliases%20offline_access&prompt=none&max_age=0",
        ))
        const url = new URL((await delegated(response)).url)

        expect(url.pathname).toBe("/api/auth/oauth2/authorize")
        expect(url.searchParams.get("scope")).toBe("anon.li:aliases offline_access")
        // Consent can never be skipped, whatever prompt the client sent.
        expect(url.searchParams.get("prompt")).toBe("consent")
        expect(url.searchParams.has("max_age")).toBe(false)
        expect(url.searchParams.getAll("resource")).toEqual(["https://anon.li/api/mcp"])
    })

    it("forces consent on the legacy 1.6 authorize path and maps it to /oauth2/authorize", async () => {
        const { GET } = await import("@/app/api/auth/[...all]/route")
        const response = await GET(new Request(
            "https://anon.li/api/auth/mcp/authorize?client_id=client-1&scope=openid%20profile%20email&resource=https%3A%2F%2Fanon.li",
        ))
        const url = new URL((await delegated(response)).url)

        expect(url.pathname).toBe("/api/auth/oauth2/authorize")
        expect(url.searchParams.get("prompt")).toBe("consent")
        // An empty scope would issue a token that fails every tool with
        // INSUFFICIENT_SCOPE — the default set is used instead.
        expect(url.searchParams.get("scope")).toBe("anon.li:aliases anon.li:drops anon.li:forms offline_access")
        // 1.6 advertised the bare origin as the resource.
        expect(url.searchParams.getAll("resource")).toEqual(["https://anon.li/api/mcp"])
    })

    it("leaves unknown resources for the provider to reject", async () => {
        const { GET } = await import("@/app/api/auth/[...all]/route")
        const response = await GET(new Request(
            "https://anon.li/api/auth/oauth2/authorize?client_id=c&resource=https%3A%2F%2Fevil.example",
        ))
        expect(new URL((await delegated(response)).url).searchParams.getAll("resource")).toEqual(["https://evil.example"])
    })

    it("does not offer form-encoded authorize POSTs (they would bypass forced consent)", async () => {
        const { POST } = await import("@/app/api/auth/[...all]/route")
        const response = await POST(new Request("https://anon.li/api/auth/oauth2/authorize", form({ client_id: "c" })))
        expect(response.status).toBe(405)
        expect(nextAuthHandlers.POST).not.toHaveBeenCalled()
    })

    it("passes unrelated auth requests through untouched", async () => {
        const { GET, POST } = await import("@/app/api/auth/[...all]/route")
        const getRequest = new Request("https://anon.li/api/auth/get-session")
        await GET(getRequest)
        expect(nextAuthHandlers.GET).toHaveBeenCalledWith(getRequest)
        const postRequest = new Request("https://anon.li/api/auth/sign-in/email", { method: "POST", body: "{}" })
        await POST(postRequest)
        expect(nextAuthHandlers.POST).toHaveBeenCalledWith(postRequest)
    })

    it("binds token requests to the MCP resource and serves the legacy token path", async () => {
        const { POST } = await import("@/app/api/auth/[...all]/route")
        const response = await POST(new Request("https://anon.li/api/auth/mcp/token", form({
            grant_type: "refresh_token",
            client_id: "public-client",
            refresh_token: "rt",
        })))
        const forwarded = await delegated(response)
        expect(new URL(forwarded.url).pathname).toBe("/api/auth/oauth2/token")
        const body = new URLSearchParams(forwarded.body)
        expect(body.get("resource")).toBe("https://anon.li/api/mcp")
        expect(body.get("refresh_token")).toBe("rt")
        expect(forwarded.authorization).toBeNull()
    })

    it("re-presents body credentials as Basic auth for clients imported from 1.6", async () => {
        findOauthClient.mockResolvedValue({
            tokenEndpointAuthMethod: "client_secret_basic",
            metadata: { anonli_legacy_import: "better-auth-1.6-mcp" },
        })
        const { POST } = await import("@/app/api/auth/[...all]/route")
        const response = await POST(new Request("https://anon.li/api/auth/oauth2/token", form({
            grant_type: "refresh_token",
            client_id: "legacy client",
            client_secret: "s3cr:et",
            refresh_token: "rt",
        })))
        const forwarded = await delegated(response)
        const body = new URLSearchParams(forwarded.body)
        expect(body.has("client_id")).toBe(false)
        expect(body.has("client_secret")).toBe(false)
        expect(forwarded.authorization).toBe(`Basic ${Buffer.from("legacy%20client:s3cr%3Aet").toString("base64")}`)
    })

    it.each([
        ["a client registered after the upgrade", { tokenEndpointAuthMethod: "client_secret_basic", metadata: null }],
        ["an imported client_secret_post client", { tokenEndpointAuthMethod: "client_secret_post", metadata: { anonli_legacy_import: "x" } }],
        ["an unknown client", null],
    ])("leaves credentials alone for %s", async (_label, client) => {
        findOauthClient.mockResolvedValue(client)
        const { POST } = await import("@/app/api/auth/[...all]/route")
        const forwarded = await delegated(await POST(new Request("https://anon.li/api/auth/oauth2/token", form({
            grant_type: "authorization_code",
            client_id: "c",
            client_secret: "s",
            code: "x",
        }))))
        expect(new URLSearchParams(forwarded.body).get("client_secret")).toBe("s")
        expect(forwarded.authorization).toBeNull()
    })

    it("normalizes dynamic client registrations on both registration paths", async () => {
        const { POST } = await import("@/app/api/auth/[...all]/route")
        for (const path of ["/api/auth/oauth2/register", "/api/auth/mcp/register"]) {
            const response = await POST(new Request(`https://anon.li${path}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    client_name: "Claude Code",
                    redirect_uris: ["http://localhost:33418/callback"],
                    token_endpoint_auth_method: "none",
                    scope: "openid profile",
                }),
            }))
            const forwarded = await delegated(response)
            expect(new URL(forwarded.url).pathname).toBe("/api/auth/oauth2/register")
            const body = JSON.parse(forwarded.body) as Record<string, unknown>
            expect(body).toMatchObject({ application_type: "native", grant_types: ["authorization_code", "refresh_token"] })
            expect(body).not.toHaveProperty("scope")
        }
    })
})

describe("/.well-known/oauth-authorization-server", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        getOAuthServerMetadata.mockResolvedValue(Response.json({
            client_id_metadata_document_supported: true,
            scopes_supported: ["anon.li:aliases", "anon.li:drops", "anon.li:forms", "offline_access"],
            issuer: "https://anon.li",
            authorization_endpoint: "https://anon.li/api/auth/oauth2/authorize",
            token_endpoint: "https://anon.li/api/auth/oauth2/token",
            jwks_uri: "https://anon.li/api/auth/jwks",
            registration_endpoint: "https://anon.li/api/auth/oauth2/register",
            introspection_endpoint: "https://anon.li/api/auth/oauth2/introspect",
            introspection_endpoint_auth_methods_supported: ["client_secret_basic"],
            revocation_endpoint: "https://anon.li/api/auth/oauth2/revoke",
            response_types_supported: ["code"],
            grant_types_supported: ["authorization_code", "refresh_token"],
            code_challenge_methods_supported: ["S256"],
            token_endpoint_auth_methods_supported: ["none", "client_secret_basic", "client_secret_post"],
            backchannel_logout_supported: true,
            backchannel_logout_session_supported: true,
        }, { headers: { "Cache-Control": "public, max-age=15" } }))
    })

    it("returns the provider's RFC 8414 document trimmed to what anon.li serves", async () => {
        const { GET } = await import("@/app/.well-known/oauth-authorization-server/route")
        const request = new Request("https://anon.li/.well-known/oauth-authorization-server")
        const response = await GET(request)
        expect(getOAuthServerMetadata).toHaveBeenCalledWith(request)
        expect(response.status).toBe(200)
        expect(response.headers.get("content-type")).toContain("application/json")
        expect(response.headers.get("access-control-allow-origin")).toBe("*")
        expect(response.headers.get("cache-control")).toBe("public, max-age=15")

        const body = await response.json()
        expect(body.issuer).toBe("https://anon.li")
        expect(body.authorization_endpoint).toMatch(/\/api\/auth\/oauth2\/authorize$/)
        expect(body.token_endpoint).toMatch(/\/api\/auth\/oauth2\/token$/)
        expect(body.registration_endpoint).toMatch(/\/api\/auth\/oauth2\/register$/)
        expect(body.client_id_metadata_document_supported).toBe(true)
        expect(body.scopes_supported).toEqual(["anon.li:aliases", "anon.li:drops", "anon.li:forms", "offline_access"])
        expect(body.introspection_endpoint).toBeUndefined()
        expect(body.introspection_endpoint_auth_methods_supported).toBeUndefined()
        expect(body.backchannel_logout_supported).toBeUndefined()
        expect(body.code_challenge_methods_supported).toEqual(["S256"])
    })
})

describe("/.well-known/oauth-protected-resource", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        authHandler.mockResolvedValue(Response.json({
            resource: "https://anon.li/api/mcp",
            authorization_servers: ["https://anon.li"],
            bearer_methods_supported: ["header"],
            scopes_supported: ["anon.li:aliases", "anon.li:drops", "anon.li:forms"],
        }))
    })

    it.each([
        ["root", "@/app/.well-known/oauth-protected-resource/route", "https://anon.li/.well-known/oauth-protected-resource"],
        ["path-suffixed", "@/app/.well-known/oauth-protected-resource/api/mcp/route", "https://anon.li/.well-known/oauth-protected-resource/api/mcp"],
    ])("serves the mcp() plugin's RFC 9728 document at the %s URL with CORS", async (_label, modulePath, url) => {
        const { GET } = await import(modulePath) as { GET: (request: Request) => Promise<Response> }
        const request = new Request(url)
        const response = await GET(request)
        expect(authHandler).toHaveBeenCalledWith(request)
        expect(response.status).toBe(200)
        expect(response.headers.get("access-control-allow-origin")).toBe("*")
        const body = await response.json()
        expect(body.resource).toBe("https://anon.li/api/mcp")
        expect(body.authorization_servers).toEqual(["https://anon.li"])
    })
})

describe("normalizeMcpRequestedScope", () => {
    const DEFAULT_SCOPE = "anon.li:aliases anon.li:drops anon.li:forms offline_access"

    it("defaults to the full scope set when no scope is requested", async () => {
        const { normalizeMcpRequestedScope } = await import("@/lib/mcp/oauth-metadata")
        expect(normalizeMcpRequestedScope(null)).toBe(DEFAULT_SCOPE)
        expect(normalizeMcpRequestedScope(undefined)).toBe(DEFAULT_SCOPE)
        expect(normalizeMcpRequestedScope("   ")).toBe(DEFAULT_SCOPE)
    })

    it("strips OIDC-compatibility scopes while keeping functional ones", async () => {
        const { normalizeMcpRequestedScope } = await import("@/lib/mcp/oauth-metadata")
        expect(normalizeMcpRequestedScope("openid profile anon.li:aliases offline_access"))
            .toBe("anon.li:aliases offline_access")
    })

    it("falls back to the default set when only OIDC scopes are requested", async () => {
        const { normalizeMcpRequestedScope } = await import("@/lib/mcp/oauth-metadata")
        expect(normalizeMcpRequestedScope("openid profile email")).toBe(DEFAULT_SCOPE)
        // offline_access alone is not a functional gate either.
        expect(normalizeMcpRequestedScope("openid offline_access")).toBe(DEFAULT_SCOPE)
    })

    it("preserves deliberate narrowing to a subset of functional scopes", async () => {
        const { normalizeMcpRequestedScope } = await import("@/lib/mcp/oauth-metadata")
        expect(normalizeMcpRequestedScope("openid anon.li:drops")).toBe("anon.li:drops")
        expect(normalizeMcpRequestedScope("anon.li:aliases anon.li:forms")).toBe("anon.li:aliases anon.li:forms")
    })

    it("de-duplicates repeated scopes", async () => {
        const { normalizeMcpRequestedScope } = await import("@/lib/mcp/oauth-metadata")
        expect(normalizeMcpRequestedScope("anon.li:drops anon.li:drops anon.li:drops")).toBe("anon.li:drops")
    })
})
