import { describe, expect, it } from "vitest"

import {
    isSafeMcpRedirectUri,
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
