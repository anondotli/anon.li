import { describe, expect, it } from "vitest"

import {
    isSafeMcpRedirectUri,
    normalizeMcpClientRegistration,
    registeredRedirectOrigins,
    validateMcpClientRegistration,
} from "@/lib/mcp/client-registration"

describe("MCP dynamic client registration", () => {
    it("accepts HTTPS and local loopback callbacks", () => {
        expect(validateMcpClientRegistration({
            client_name: "Local MCP client",
            redirect_uris: ["http://127.0.0.1:43210/callback", "https://client.example/callback"],
            logo_uri: "https://client.example/logo.png",
        })).toBeNull()
        expect(isSafeMcpRedirectUri("http://localhost:4567/oauth/callback")).toBe(true)
        expect(isSafeMcpRedirectUri("https://client.example/callback")).toBe(true)
    })

    it.each([
        ["active-content callback", { client_name: "Bad", redirect_uris: ["javascript:alert(1)"] }],
        ["remote plaintext callback", { client_name: "Bad", redirect_uris: ["http://client.example/callback"] }],
        ["credential-bearing callback", { client_name: "Bad", redirect_uris: ["https://user:pass@client.example/callback"] }],
        ["fragment callback", { client_name: "Bad", redirect_uris: ["https://client.example/callback#fragment"] }],
        ["local logo probe", { client_name: "Bad", redirect_uris: ["https://client.example/callback"], logo_uri: "http://localhost:3000/icon" }],
        ["missing client name", { redirect_uris: ["https://client.example/callback"] }],
    ])("rejects %s", (_label, body) => {
        expect(validateMcpClientRegistration(body)).not.toBeNull()
    })

    it("rejects unsafe redirect URIs for existing clients too", () => {
        expect(isSafeMcpRedirectUri("http://client.example/callback")).toBe(false)
        expect(isSafeMcpRedirectUri("data:text/html,hello")).toBe(false)
        expect(isSafeMcpRedirectUri("https://client.example/callback#fragment")).toBe(false)
    })
})

describe("registeredRedirectOrigins (consent-screen disclosure)", () => {
    it("extracts distinct origins from the stored redirect URIs", () => {
        expect(registeredRedirectOrigins([
            "https://client.example/callback",
            "http://127.0.0.1:43210/cb",
            "https://other.example/oauth/cb",
        ])).toEqual([
            "https://client.example",
            "http://127.0.0.1:43210",
            "https://other.example",
        ])
    })

    it("collapses multiple paths on the same origin", () => {
        expect(registeredRedirectOrigins([
            "https://client.example/a",
            "https://client.example/b",
        ])).toEqual(["https://client.example"])
    })

    it("drops malformed or unsafe entries instead of rendering them", () => {
        expect(registeredRedirectOrigins([
            "https://client.example/cb",
            "javascript:alert(1)",
            "http://remote.example/cb",
            "https://x.example/cb#frag",
            "not a url",
        ])).toEqual(["https://client.example", "https://x.example"])
    })

    it("returns an empty list for missing values", () => {
        expect(registeredRedirectOrigins(null)).toEqual([])
        expect(registeredRedirectOrigins(undefined)).toEqual([])
        expect(registeredRedirectOrigins([])).toEqual([])
        expect(registeredRedirectOrigins(["  "])).toEqual([])
    })
})

describe("normalizeMcpClientRegistration (better-auth 1.7 DCR)", () => {
    it("infers native for loopback callbacks so desktop/CLI clients can register", () => {
        expect(normalizeMcpClientRegistration({
            client_name: "Claude Code",
            redirect_uris: ["http://localhost:43210/callback"],
            token_endpoint_auth_method: "none",
        })).toMatchObject({ application_type: "native" })
        expect(normalizeMcpClientRegistration({
            client_name: "Mixed",
            redirect_uris: ["https://client.example/cb", "http://127.0.0.1:5555/cb"],
        })).toMatchObject({ application_type: "native" })
    })

    it("infers web for HTTPS-only callbacks and never overrides an explicit type", () => {
        expect(normalizeMcpClientRegistration({
            client_name: "Claude",
            redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
        })).toMatchObject({ application_type: "web" })
        expect(normalizeMcpClientRegistration({
            client_name: "Explicit",
            application_type: "web",
            redirect_uris: ["http://localhost:1/cb"],
        })).toMatchObject({ application_type: "web" })
    })

    it("drops scope and resources, which 1.7 would reject for MCP clients", () => {
        const normalized = normalizeMcpClientRegistration({
            client_name: "OIDC-ish",
            redirect_uris: ["https://client.example/cb"],
            scope: "openid profile email anon.li:aliases",
            resources: ["https://anon.li"],
        }) as Record<string, unknown>
        expect(normalized).not.toHaveProperty("scope")
        expect(normalized).not.toHaveProperty("resources")
    })

    it("narrows grant types to the supported grants and keeps response types reciprocal", () => {
        expect(normalizeMcpClientRegistration({
            client_name: "Grants",
            redirect_uris: ["https://client.example/cb"],
            grant_types: ["authorization_code", "refresh_token", "client_credentials", "implicit"],
            response_types: ["code", "token"],
        })).toMatchObject({
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
        })
        expect(normalizeMcpClientRegistration({
            client_name: "No grants",
            redirect_uris: ["https://client.example/cb"],
        })).toMatchObject({ grant_types: ["authorization_code", "refresh_token"] })
    })

    it("passes non-object bodies through for validation to reject", () => {
        expect(normalizeMcpClientRegistration(null)).toBeNull()
        expect(normalizeMcpClientRegistration("x")).toBe("x")
    })

    it("rejects back-channel and RP-initiated logout metadata", () => {
        for (const field of ["backchannel_logout_uri", "backchannel_logout_session_required", "post_logout_redirect_uris"]) {
            expect(validateMcpClientRegistration({
                client_name: "Logout",
                redirect_uris: ["https://client.example/cb"],
                [field]: field === "backchannel_logout_session_required" ? true : "https://client.example/logout",
            })).toMatch(/not supported/)
        }
    })

    it("rejects unsupported token endpoint auth methods", () => {
        expect(validateMcpClientRegistration({
            client_name: "JWT client",
            redirect_uris: ["https://client.example/cb"],
            token_endpoint_auth_method: "private_key_jwt",
        })).not.toBeNull()
    })
})
