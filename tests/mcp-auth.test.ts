/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const getMcpOAuthConfig = vi.fn()
const getMCPProtectedResource = vi.fn()

vi.mock("@/lib/auth", () => ({
    auth: {
        api: {
            getMcpOAuthConfig,
            getMCPProtectedResource,
        },
    },
}))

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
        })
    })

    it("returns the protected-resource metadata RFC 9728 document", async () => {
        const { GET } = await import("@/app/.well-known/oauth-protected-resource/route")
        const response = await GET(new Request("https://anon.li/.well-known/oauth-protected-resource"))
        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.resource).toBe("https://anon.li")
        expect(body.authorization_servers).toEqual(["https://anon.li"])
        expect(body.bearer_methods_supported).toContain("header")
    })
})
