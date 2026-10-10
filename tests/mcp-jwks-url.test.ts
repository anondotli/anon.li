/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { getMcpJwksUrl } from "@/lib/mcp/oauth-metadata"

afterEach(() => {
    vi.unstubAllEnvs()
})

describe("getMcpJwksUrl", () => {
    it("uses the default JWKS URL outside Vercel previews", () => {
        vi.stubEnv("VERCEL_ENV", "production")
        vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "bypass-secret")
        expect(getMcpJwksUrl()).toBeUndefined()
    })

    it("uses the default JWKS URL on previews without a bypass secret", () => {
        vi.stubEnv("VERCEL_ENV", "preview")
        vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "")
        expect(getMcpJwksUrl()).toBeUndefined()
    })

    it("appends the automation bypass token on protected previews", () => {
        vi.stubEnv("VERCEL_ENV", "preview")
        vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "bypass secret")
        vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://anon-li-git-feature.vercel.app")
        expect(getMcpJwksUrl()).toBe(
            "https://anon-li-git-feature.vercel.app/api/auth/jwks?x-vercel-protection-bypass=bypass+secret",
        )
    })
})
