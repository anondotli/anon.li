/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest"
import { sanitizeAuthCallbackUrl } from "@/lib/safe-callback-url"

const FALLBACK = "/dashboard/alias"

describe("sanitizeAuthCallbackUrl", () => {
    it.each([
        "/dashboard",
        "/dashboard/settings",
        "/dashboard/drop?tab=1#x",
        "/accept-invitation/abc123_XYZ-9",
        "/oauth/consent?consent_code=c&client_id=x&scope=anon.li%3Aaliases",
        "/oauth/consent?client_id=x&scope=anon.li%3Aaliases&prompt=consent&exp=1&ba_param=client_id&ba_param=exp&sig=abc%3D",
    ])("allows same-origin allowlisted path %s", (input) => {
        expect(sanitizeAuthCallbackUrl(input)).toBe(input)
    })

    it.each([
        "https://evil.example/dashboard",
        "//evil.example/dashboard",
        "/\\evil.example",
        "/dashboard\\..\\admin",
        "javascript:alert(1)",
        "/admin",
        "/dashboardx",
        "/dashboard/../admin",
        "/dashboard/%2e%2e/admin",
        "/accept-invitation/",
        "/accept-invitation/abc/../../admin",
        "/accept-invitation/abc/extra",
        "/oauth/consent/../../admin",
        "/oauth/consentx",
        "/api/auth/mcp/authorize?client_id=x",
    ])("rejects %s", (input) => {
        expect(sanitizeAuthCallbackUrl(input)).toBe(FALLBACK)
    })

    it("returns the normalized form, never raw control characters", () => {
        expect(sanitizeAuthCallbackUrl("/dashboard/settings%0D%0ASet-Cookie:x=1")).toBe("/dashboard/settings%0D%0ASet-Cookie:x=1")
        expect(sanitizeAuthCallbackUrl("/dashboard/\tsettings")).toBe("/dashboard/settings")
        expect(sanitizeAuthCallbackUrl("/dashboard/set\r\ntings?x=\t1")).toBe("/dashboard/settings?x=1")

        for (const input of ["/dashboard/\tsettings", "/dashboard/set\r\ntings", "/oauth/consent?a=\tb"]) {
            expect(sanitizeAuthCallbackUrl(input)).not.toMatch(/[\t\r\n]/)
        }
    })

    it("rejects a protocol-relative URL hidden behind a stripped tab", () => {
        expect(sanitizeAuthCallbackUrl("/\t/evil.example/dashboard")).toBe(FALLBACK)
    })

    it("normalizes dot-segments that stay inside the allowlist", () => {
        expect(sanitizeAuthCallbackUrl("/dashboard/drop/../alias")).toBe("/dashboard/alias")
    })

    it("falls back for empty input", () => {
        expect(sanitizeAuthCallbackUrl(null)).toBe(FALLBACK)
        expect(sanitizeAuthCallbackUrl("")).toBe(FALLBACK)
    })
})
