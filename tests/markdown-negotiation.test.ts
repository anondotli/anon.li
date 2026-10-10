/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import proxy from "@/proxy"

describe("markdown negotiation", () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it("rewrites only when markdown is explicitly preferred", async () => {
        async function rewriteForAccept(accept: string) {
            const response = await proxy(new NextRequest("http://localhost/docs/api", {
                headers: { Accept: accept },
            }))
            return response.headers.get("x-middleware-rewrite")
        }

        expect(await rewriteForAccept("text/markdown, text/html;q=0.9")).toBe("http://localhost/__markdown?target=%2Fdocs%2Fapi")
        expect(await rewriteForAccept("text/*")).toBe("http://localhost/__markdown?target=%2Fdocs%2Fapi")
        expect(await rewriteForAccept("*/*")).toBeNull()
        expect(await rewriteForAccept("text/html, text/markdown;q=0.5")).toBeNull()
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
                        <title>Developer API - anon.li</title>
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

        const { GET } = await import("@/app/%5F%5Fmarkdown/route")
        const response = await GET(new Request("http://localhost/__markdown?target=%2Fdocs%2Fapi", {
            headers: {
                Accept: "text/markdown",
                cookie: "session=abc123",
                "x-markdown-rewrite": "1",
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
        expect(body).toContain("title: \"Developer API - anon.li\"")
        expect(body).toContain("# Developer API")
        expect(body).toContain("[Alias API](http://localhost/docs/api/alias)")
        expect(body).toContain("```")
        // Negotiated responses at the public URL stay indexable.
        expect(response.headers.get("x-robots-tag")).toBeNull()
    })

    it("marks direct hits on the internal converter path as noindex", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("<html><body><main><h1>Docs</h1></main></body></html>", {
                headers: { "content-type": "text/html" },
            }),
        )

        const { GET } = await import("@/app/%5F%5Fmarkdown/route")
        const response = await GET(new Request("http://localhost/__markdown?target=%2Fdocs"))

        expect(response.status).toBe(200)
        expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow")
    })

    it.each([
        "/\\evil.example/",
        "//evil.example/",
        "https://evil.example/",
        "/__markdown?target=%2Fdocs",
        "",
    ])("rejects unsafe markdown target %j without fetching", async (target) => {
        const fetchMock = vi.spyOn(globalThis, "fetch")

        const { GET } = await import("@/app/%5F%5Fmarkdown/route")
        const response = await GET(new Request(`http://localhost/__markdown?target=${encodeURIComponent(target)}`))

        expect(response.status).toBe(400)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it("never rewrites requests for the internal converter path", async () => {
        const response = await proxy(new NextRequest("http://localhost/__markdown?target=%2Fdocs", {
            headers: { Accept: "text/markdown" },
        }))

        expect(response.headers.get("x-middleware-rewrite")).toBeNull()
    })
})
