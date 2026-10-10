/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest"
import crypto from "crypto"
import { NextRequest } from "next/server"
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server"
import proxy, { config } from "@/proxy"
import { THEME_INIT_SCRIPT, THEME_INIT_SCRIPT_SHA256 } from "@/lib/theme-init"

describe("proxy auth guard", () => {
    it("redirects protected routes without a session", async () => {
        const response = await proxy(new NextRequest("http://localhost/dashboard/alias"))

        expect(response.status).toBe(307)
        expect(response.headers.get("location")).toBe("http://localhost/login?callbackUrl=%2Fdashboard%2Falias")
    })

    it("does not echo admin paths into the login redirect", async () => {
        const response = await proxy(new NextRequest("http://localhost/admin/users"))

        expect(response.headers.get("location")).toBe("http://localhost/login")
    })

    it("overwrites a client-supplied x-pathname request header", async () => {
        const response = await proxy(new NextRequest("http://localhost/login?x=1", {
            headers: { "x-pathname": "https://evil.example/" },
        }))

        expect(response.headers.get("x-middleware-request-x-pathname")).toBe("/login?x=1")
    })

    it("allows the 2FA page when a pending two-factor cookie exists", async () => {
        const response = await proxy(new NextRequest("http://localhost/2fa", {
            headers: {
                cookie: "better-auth.two_factor=signed-pending-token",
            },
        }))

        expect(response.headers.get("location")).toBeNull()
        expect(response.headers.get("x-request-id")).toBeTruthy()
    })

    it.each(["/alias%5C", "/alias%5c", "/dashboard%5Calias"])("returns 404 for encoded backslash path %s", async (path) => {
        const response = await proxy(new NextRequest(`http://localhost${path}`))

        expect(response.status).toBe(404)
        expect(response.headers.get("location")).toBeNull()
    })

    it("allows Turnstile network calls in CSP", async () => {
        const response = await proxy(new NextRequest("http://localhost/login"))
        const csp = response.headers.get("content-security-policy")

        expect(csp).toContain("script-src")
        expect(csp).toContain("frame-src 'self' https://challenges.cloudflare.com")
        expect(csp).toMatch(/connect-src[^;]*https:\/\/challenges\.cloudflare\.com/)
    })

    it("allows public form pages to be framed", async () => {
        const response = await proxy(new NextRequest("http://localhost/f/public-form"))

        expect(response.headers.get("content-security-policy")).toContain("frame-ancestors *")
    })

    it("forbids framing non-public pages", async () => {
        const response = await proxy(new NextRequest("http://localhost/"))

        expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'")
    })

    it("pins the THEME_INIT_SCRIPT_SHA256 to the actual script content", () => {
        const computed = crypto
            .createHash("sha256")
            .update(THEME_INIT_SCRIPT)
            .digest("base64")

        expect(computed).toBe(THEME_INIT_SCRIPT_SHA256)
    })

    it("includes the theme-bootstrap script hashes in strict-mode CSP", async () => {
        const response = await proxy(new NextRequest("http://localhost/login", {
            headers: { cookie: "better-auth.two_factor=signed-pending-token" },
        }))
        const csp = response.headers.get("content-security-policy") ?? ""
        const scriptSrc = csp.split(";").find((d) => d.trim().startsWith("script-src")) ?? ""

        expect(scriptSrc).toContain(`'sha256-${THEME_INIT_SCRIPT_SHA256}'`)
        expect(scriptSrc).toContain("'sha256-n46vPwSWuMC0W703pBofImv82Z26xo4LXymv0E9caPk='")
        expect(scriptSrc).not.toContain("'unsafe-inline'")
    })

    it("omits the theme-bootstrap hashes from relaxed CSP for marketing pages", async () => {
        const response = await proxy(new NextRequest("http://localhost/"))
        const csp = response.headers.get("content-security-policy") ?? ""
        const scriptSrc = csp.split(";").find((d) => d.trim().startsWith("script-src")) ?? ""

        expect(scriptSrc).not.toContain(`'sha256-${THEME_INIT_SCRIPT_SHA256}'`)
        expect(scriptSrc).toContain("'unsafe-inline'")
    })
})

function scriptSrcOf(response: Response): string {
    const csp = response.headers.get("content-security-policy") ?? ""
    return csp.split(";").find((d) => d.trim().startsWith("script-src")) ?? ""
}

describe("proxy strict CSP for public Drop/Form pages", () => {
    it.each(["/d/abc123", "/f/form123", "/embed/f/form123"])("applies a nonce-based CSP to %s", async (path) => {
        const response = await proxy(new NextRequest(`http://localhost${path}`))
        const scriptSrc = scriptSrcOf(response)
        const nonce = response.headers.get("x-middleware-request-x-nonce")

        expect(nonce).toBeTruthy()
        expect(scriptSrc).toContain(`'nonce-${nonce}'`)
        expect(scriptSrc).toContain("'strict-dynamic'")
        expect(scriptSrc).toContain(`'sha256-${THEME_INIT_SCRIPT_SHA256}'`)
        expect(scriptSrc).not.toContain("'unsafe-inline'")
        // Turnstile must still load on public forms.
        expect(response.headers.get("content-security-policy")).toContain("frame-src 'self' https://challenges.cloudflare.com")
    })

    it("keeps public forms embeddable under the strict policy", async () => {
        const response = await proxy(new NextRequest("http://localhost/f/form123"))

        expect(response.headers.get("content-security-policy")).toContain("frame-ancestors *")
    })

    it("keeps drop pages unframeable", async () => {
        const response = await proxy(new NextRequest("http://localhost/d/abc123"))

        expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'")
    })

    it.each(["/docs", "/drop", "/faq", "/form", "/features"])("does not treat %s as a strict /d or /f path", async (path) => {
        const response = await proxy(new NextRequest(`http://localhost${path}`))

        expect(scriptSrcOf(response)).toContain("'unsafe-inline'")
        expect(response.headers.get("x-middleware-request-x-nonce")).toBeNull()
    })
})

describe("proxy matcher", () => {
    function matches(path: string) {
        return unstable_doesMiddlewareMatch({ config, url: `http://localhost${path}` })
    }

    it.each([
        "/blog",
        "/blog/introducing-form",
        "/docs",
        "/docs/api/alias",
        "/docs/cli/drop",
        "/cli",
        "/d/abc123",
        "/f/form123",
    ])("runs on page route %s", (path) => {
        expect(matches(path)).toBe(true)
    })

    it.each([
        "/cli/install.sh",
        "/cli/install.ps1",
        "/docs/context7.json",
        "/llms.txt",
        "/canary.json",
        "/robots.txt",
        "/sitemap.xml",
        "/fonts/geist.woff2",
        "/_next/static/chunks/main.js",
        "/api/health",
    ])("skips static file %s", (path) => {
        expect(matches(path)).toBe(false)
    })

    it("applies CSP, request id, Vary and ?ref= capture to blog and docs pages", async () => {
        for (const path of ["/blog/introducing-form?ref=ABCDEF12", "/docs/api/alias?ref=ABCDEF12"]) {
            const response = await proxy(new NextRequest(`http://localhost${path}`))

            expect(response.headers.get("content-security-policy")).toContain("script-src")
            expect(response.headers.get("x-request-id")).toBeTruthy()
            expect(response.headers.get("vary")).toContain("Accept")
            expect(response.cookies.get("anonli_ref")?.value).toBe("ABCDEF12")
        }
    })
})

describe("proxy markdown rewrite marker", () => {
    it("marks negotiated markdown rewrites for the converter route", async () => {
        const response = await proxy(new NextRequest("http://localhost/blog/introducing-form", {
            headers: { Accept: "text/markdown" },
        }))

        expect(response.headers.get("x-middleware-rewrite")).toBe(
            "http://localhost/__markdown?target=%2Fblog%2Fintroducing-form",
        )
        expect(response.headers.get("x-middleware-request-x-markdown-rewrite")).toBe("1")
    })

    it("strips a client-supplied rewrite marker", async () => {
        const response = await proxy(new NextRequest("http://localhost/__markdown?target=%2Fdocs", {
            headers: { "x-markdown-rewrite": "1" },
        }))

        expect(response.headers.get("x-middleware-rewrite")).toBeNull()
        expect(response.headers.get("x-middleware-request-x-markdown-rewrite")).toBeNull()
    })
})
