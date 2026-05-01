/**
 * @vitest-environment node
 */
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js"
import { describe, expect, it } from "vitest"

import { API_CATALOG_PROFILE, HOMEPAGE_LINK_HEADER } from "@/config/agent-discovery"
import nextConfig from "../next.config"

describe("agent discovery", () => {
    it("adds agent-useful Link headers to the homepage response", async () => {
        const headersConfig = await nextConfig.headers?.()
        const homepageHeaders = headersConfig?.find((entry) => entry.source === "/")

        expect(homepageHeaders?.headers).toContainEqual({
            key: "Link",
            value: HOMEPAGE_LINK_HEADER,
        })
    })

    it("serves a standards-aligned API catalog document", async () => {
        const { GET } = await import("@/app/.well-known/api-catalog/route")
        const response = GET()

        expect(response.status).toBe(200)
        expect(response.headers.get("content-type")).toBe(
            `application/linkset+json; profile="${API_CATALOG_PROFILE}"`,
        )

        const body = await response.json() as {
            linkset: Array<Record<string, unknown>>
        }

        expect(body.linkset[0]).toEqual({
            anchor: "https://anon.li/.well-known/api-catalog",
            item: [
                { href: "https://anon.li/api/v1/alias" },
                { href: "https://anon.li/api/v1/drop" },
                { href: "https://anon.li/api/v1/form" },
                { href: "https://anon.li/api/v1/domain" },
                { href: "https://anon.li/api/v1/recipient" },
                { href: "https://anon.li/api/mcp" },
            ],
        })

        const mcpEntry = body.linkset.find((entry) => entry.anchor === "https://anon.li/api/mcp")

        expect(mcpEntry).toMatchObject({
            "service-doc": [
                { href: "https://anon.li/docs/api/mcp", type: "text/html" },
            ],
            "service-meta": [
                {
                    href: "https://anon.li/.well-known/mcp/server-card.json",
                    type: "application/json",
                },
                {
                    href: "https://anon.li/.well-known/oauth-authorization-server",
                    type: "application/json",
                },
                {
                    href: "https://anon.li/.well-known/oauth-protected-resource",
                    type: "application/json",
                },
            ],
        })
    })

    it("serves an MCP Server Card for pre-connection discovery", async () => {
        const { GET, OPTIONS } = await import("@/app/.well-known/mcp/server-card.json/route")
        const response = GET()

        expect(response.status).toBe(200)
        expect(response.headers.get("content-type")).toContain("application/json")
        expect(response.headers.get("cache-control")).toBe(
            "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
        )
        expect(response.headers.get("access-control-allow-origin")).toBe("*")
        expect(response.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS")
        expect(response.headers.get("access-control-allow-headers")).toBe(
            "Content-Type, MCP-Protocol-Version",
        )

        await expect(response.json()).resolves.toEqual({
            $schema: "https://static.modelcontextprotocol.io/schemas/mcp-server-card/v1.json",
            version: "1.0",
            protocolVersion: LATEST_PROTOCOL_VERSION,
            serverInfo: {
                name: "anon.li",
                version: "1.0.0",
            },
            documentationUrl: "https://anon.li/docs/api/mcp",
            transport: {
                type: "streamable-http",
                endpoint: "/api/mcp",
            },
            capabilities: {
                tools: {},
            },
        })

        const optionsResponse = OPTIONS()

        expect(optionsResponse.status).toBe(204)
        expect(optionsResponse.headers.get("access-control-allow-origin")).toBe("*")
        expect(optionsResponse.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS")
        expect(optionsResponse.headers.get("access-control-allow-headers")).toBe(
            "Content-Type, MCP-Protocol-Version",
        )
    })
})
