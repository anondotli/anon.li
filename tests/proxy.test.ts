/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it } from "vitest"
import crypto from "crypto"
import { NextRequest } from "next/server"
import proxy from "@/proxy"
import { THEME_INIT_SCRIPT, THEME_INIT_SCRIPT_SHA256 } from "@/lib/theme-init"

describe("proxy auth guard", () => {
    const originalTurnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

    afterEach(() => {
        if (originalTurnstileSiteKey === undefined) {
            delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
        } else {
            process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = originalTurnstileSiteKey
        }
    })

    it("redirects protected routes without a session", async () => {
        const response = await proxy(new NextRequest("http://localhost/dashboard/alias"))

        expect(response.status).toBe(307)
        expect(response.headers.get("location")).toBe("http://localhost/login")
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

    it("allows Turnstile network calls in CSP when captcha is configured", async () => {
        process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site-key"

        const response = await proxy(new NextRequest("http://localhost/login"))
        const csp = response.headers.get("content-security-policy")

        expect(csp).toContain("script-src")
        expect(csp).toContain("frame-src https://challenges.cloudflare.com")
        expect(csp).toMatch(/connect-src[^;]*https:\/\/challenges\.cloudflare\.com/)
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
