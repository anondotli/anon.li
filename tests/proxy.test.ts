/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import proxy from "@/proxy"

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
})
