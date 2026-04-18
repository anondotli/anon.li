/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import proxy from "@/proxy"
import { requestPrefersMarkdown } from "@/lib/markdown-negotiation"

describe("markdown negotiation", () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it("prefers markdown only when it is explicitly requested", () => {
        expect(requestPrefersMarkdown("text/markdown, text/html;q=0.9")).toBe(true)
        expect(requestPrefersMarkdown("text/*")).toBe(true)
        expect(requestPrefersMarkdown("*/*")).toBe(false)
        expect(requestPrefersMarkdown("text/html, text/markdown;q=0.5")).toBe(false)
    })

    it("rewrites public page requests that prefer markdown", async () => {
        const response = await proxy(new NextRequest("http://localhost/docs/api", {
            headers: {
                Accept: "text/markdown, text/html;q=0.9",
            },
        }))

        expect(response.headers.get("x-middleware-rewrite")).toBe("http://localhost/__markdown?target=%2Fdocs%2Fapi")
        expect(response.headers.get("vary")).toContain("Accept")
        expect(response.headers.get("x-request-id")).toBeTruthy()
    })

    it("keeps browser-default requests on HTML", async () => {
        const response = await proxy(new NextRequest("http://localhost/docs/api", {
            headers: {
                Accept: "*/*",
            },
        }))

        expect(response.headers.get("x-middleware-rewrite")).toBeNull()
        expect(response.headers.get("vary")).toContain("Accept")
    })

    it("returns markdown with token metadata from the converter route", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(`<!doctype html>
                <html>
                    <head>
                        <title>Developer API - Anon.li</title>
                        <meta name="description" content="Integrate with the anon.li API.">
                    </head>
                    <body>
                        <header>Navigation</header>
                        <main>
                            <h1>Developer API</h1>
                            <p>Read the <a href="/docs/api/alias">Alias API</a>.</p>
                            <pre>curl https://anon.li/api/v1/alias</pre>
                        </main>
                        <footer>Footer</footer>
                    </body>
                </html>`, {
                headers: {
                    "content-type": "text/html; charset=utf-8",
                    "cache-control": "public, max-age=60",
                },
                status: 200,
            }),
        )

        const { GET } = await import("@/app/__markdown/route")
        const response = await GET(new Request("http://localhost/__markdown?target=%2Fdocs%2Fapi", {
            headers: {
                Accept: "text/markdown",
                cookie: "session=abc123",
            },
        }))

        expect(fetchMock).toHaveBeenCalledWith(
            new URL("http://localhost/docs/api"),
            expect.objectContaining({
                headers: expect.any(Headers),
            }),
        )
        expect(response.status).toBe(200)
        expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8")
        expect(response.headers.get("x-markdown-tokens")).toBeTruthy()
        expect(response.headers.get("vary")).toContain("Accept")

        const body = await response.text()
        expect(body).toContain("title: \"Developer API - Anon.li\"")
        expect(body).toContain("# Developer API")
        expect(body).toContain("[Alias API](http://localhost/docs/api/alias)")
        expect(body).toContain("```")
    })
})
