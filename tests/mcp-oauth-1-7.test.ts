/**
 * @vitest-environment node
 *
 * better-auth 1.7 OAuth provider glue: resource canonicalization, metadata
 * trimming, consent-query verification, verified-claims mapping and the admin
 * client row mapping.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

process.env.NEXT_PUBLIC_APP_URL = "https://anon.li"

const verifyOAuthQueryParams = vi.fn(async (_query: string, _secret: string) => true)

vi.mock("@better-auth/oauth-provider", () => ({ verifyOAuthQueryParams }))
vi.mock("@/lib/auth", () => ({ auth: { $context: Promise.resolve({ secret: "test-secret" }) } }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

describe("MCP resource and issuer", () => {
    it("derives the issuer and canonical resource from NEXT_PUBLIC_APP_URL", async () => {
        const { getMcpIssuer, getMcpResource } = await import("@/lib/mcp/oauth-metadata")
        expect(getMcpIssuer()).toBe("https://anon.li")
        expect(getMcpResource()).toBe("https://anon.li/api/mcp")
    })

    it.each([
        [null, "https://anon.li/api/mcp"],
        ["", "https://anon.li/api/mcp"],
        ["https://anon.li", "https://anon.li/api/mcp"],
        ["https://anon.li/", "https://anon.li/api/mcp"],
        ["https://anon.li/api/mcp/", "https://anon.li/api/mcp"],
        ["https://anon.li/api/mcp", "https://anon.li/api/mcp"],
        ["https://other.example/api/mcp", "https://other.example/api/mcp"],
    ])("canonicalizes resource %s", async (input, expected) => {
        const { canonicalizeMcpResource } = await import("@/lib/mcp/oauth-metadata")
        expect(canonicalizeMcpResource(input)).toBe(expected)
    })
})

describe("buildOAuthQuery / parseConsentRequest", () => {
    beforeEach(() => {
        verifyOAuthQueryParams.mockClear()
        verifyOAuthQueryParams.mockResolvedValue(true)
    })

    const signed = {
        response_type: "code",
        client_id: "client-1",
        redirect_uri: "https://claude.ai/api/mcp/auth_callback",
        scope: "anon.li:aliases offline_access",
        prompt: "consent",
        resource: "https://anon.li/api/mcp",
        exp: "1791633033",
        ba_param: ["client_id", "exp", "scope"],
        sig: "abc=",
    }

    it("keeps repeated keys when rebuilding the signed query", async () => {
        const { buildOAuthQuery } = await import("@/lib/mcp/consent")
        const params = new URLSearchParams(buildOAuthQuery(signed))
        expect(params.getAll("ba_param")).toEqual(["client_id", "exp", "scope"])
        expect(params.get("sig")).toBe("abc=")
    })

    it("verifies the signature with the auth secret and exposes the request", async () => {
        const { parseConsentRequest } = await import("@/lib/mcp/consent")
        const request = await parseConsentRequest(signed)
        expect(verifyOAuthQueryParams).toHaveBeenCalledWith(expect.stringContaining("client_id=client-1"), "test-secret")
        expect(request).toMatchObject({
            clientId: "client-1",
            scopes: ["anon.li:aliases", "offline_access"],
            redirectUri: "https://claude.ai/api/mcp/auth_callback",
        })
    })

    it("rejects tampered or expired queries and unsigned requests", async () => {
        const { parseConsentRequest } = await import("@/lib/mcp/consent")
        verifyOAuthQueryParams.mockResolvedValue(false)
        expect(await parseConsentRequest(signed)).toBeNull()
        verifyOAuthQueryParams.mockResolvedValue(true)
        expect(await parseConsentRequest({ client_id: "c" })).toBeNull()
        expect(await parseConsentRequest({ sig: "x" })).toBeNull()
    })
})

describe("mcpSessionFromClaims", () => {
    it("maps sub/azp/scope onto the tool-gate session", async () => {
        const { mcpSessionFromClaims } = await import("@/lib/mcp/auth")
        expect(mcpSessionFromClaims({ sub: "user-1", azp: "client-1", client_id: "client-1", scope: "anon.li:drops" }))
            .toEqual({ userId: "user-1", clientId: "client-1", scopes: "anon.li:drops" })
        expect(mcpSessionFromClaims({ sub: "user-1", client_id: "client-2" }))
            .toEqual({ userId: "user-1", clientId: "client-2", scopes: "" })
    })

    it("rejects tokens without a user subject or client", async () => {
        const { mcpSessionFromClaims } = await import("@/lib/mcp/auth")
        expect(mcpSessionFromClaims({ azp: "client-1" })).toBeNull()
        expect(mcpSessionFromClaims({ sub: "user-1" })).toBeNull()
        expect(mcpSessionFromClaims({ sub: "", azp: "client-1" })).toBeNull()
    })
})

describe("toAdminOauthAppRow", () => {
    it("labels the client and falls back to the client id for nameless clients", async () => {
        const { toAdminOauthAppRow } = await import("@/lib/data/admin")
        const createdAt = new Date("2026-10-01T00:00:00.000Z")
        expect(toAdminOauthAppRow({
            id: "row-1",
            clientId: "https://client.example/metadata.json",
            name: null,
            tokenEndpointAuthMethod: "none",
            applicationType: "native",
            clientDiscoveryId: "cimd",
            disabled: null,
            createdAt,
            user: null,
        })).toEqual({
            id: "row-1",
            clientId: "https://client.example/metadata.json",
            name: "https://client.example/metadata.json",
            type: "public · native · CIMD",
            discovered: true,
            disabled: false,
            createdAt,
            user: null,
        })
        expect(toAdminOauthAppRow({
            id: "row-2",
            clientId: "abc",
            name: "Claude",
            tokenEndpointAuthMethod: "client_secret_basic",
            applicationType: "web",
            clientDiscoveryId: null,
            disabled: true,
            createdAt,
            user: { id: "u", email: "u@example.com", name: null },
        })).toMatchObject({ name: "Claude", type: "confidential · web", discovered: false, disabled: true })
    })
})
