/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import proxy from "@/proxy"

describe("proxy auth guard", () => {
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
})
