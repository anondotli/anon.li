import { describe, expect, it } from "vitest"

import {
    isSafeMcpRedirectUri,
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
    it("extracts distinct origins from the comma-separated stored list", () => {
        expect(registeredRedirectOrigins(
            "https://client.example/callback,http://127.0.0.1:43210/cb,https://other.example/oauth/cb",
        )).toEqual([
            "https://client.example",
            "http://127.0.0.1:43210",
            "https://other.example",
        ])
    })

    it("collapses multiple paths on the same origin", () => {
        expect(registeredRedirectOrigins(
            "https://client.example/a,https://client.example/b",
        )).toEqual(["https://client.example"])
    })

    it("drops malformed or unsafe entries instead of rendering them", () => {
        expect(registeredRedirectOrigins(
            "https://client.example/cb,javascript:alert(1),http://remote.example/cb,https://x.example/cb#frag,not a url",
        )).toEqual(["https://client.example", "https://x.example"])
    })

    it("returns an empty list for missing values", () => {
        expect(registeredRedirectOrigins(null)).toEqual([])
        expect(registeredRedirectOrigins(undefined)).toEqual([])
        expect(registeredRedirectOrigins("")).toEqual([])
        expect(registeredRedirectOrigins("  ,  ")).toEqual([])
    })
})
