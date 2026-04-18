/**
 * @vitest-environment node
 */
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
})
