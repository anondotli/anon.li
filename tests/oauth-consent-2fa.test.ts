/**
 * @vitest-environment node
 *
 * A session that hasn't passed its 2FA challenge (e.g. signed in by magic link
 * with TOTP enrolled) must not be able to grant an OAuth client access. The
 * consent endpoint enforces the same rule server-side (tests/auth-hooks.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    getSession: vi.fn(),
    findUnique: vi.fn(),
    parseConsentRequest: vi.fn(),
    redirect: vi.fn((url: string) => {
        throw new Error(`REDIRECT:${url}`)
    }),
    notFound: vi.fn(() => {
        throw new Error("NOT_FOUND")
    }),
}))

vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }))
vi.mock("@/lib/auth-session", () => ({ getSession: mocks.getSession }))
vi.mock("@/lib/prisma", () => ({ prisma: { oauthClient: { findUnique: mocks.findUnique } } }))
vi.mock("@/lib/mcp/consent", () => ({ parseConsentRequest: mocks.parseConsentRequest }))
vi.mock("@/lib/mcp/client-registration", () => ({ registeredRedirectOrigins: () => ["https://client.example"] }))
vi.mock("@/app/(auth)/oauth/consent/consent-form", () => ({ ConsentForm: () => null }))

import OAuthConsentPage from "@/app/(auth)/oauth/consent/page"

// The query better-auth's OAuth provider signs when redirecting to consent.
const signedQuery = "client_id=client-1&scope=anon.li%3Aaliases&prompt=consent&exp=1&sig=abc%3D"
const searchParams = Promise.resolve(Object.fromEntries(new URLSearchParams(signedQuery)))

describe("OAuth consent page", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.parseConsentRequest.mockResolvedValue({
            oauthQuery: signedQuery,
            clientId: "client-1",
            scopes: ["anon.li:aliases"],
            redirectUri: "https://client.example/cb",
        })
        mocks.findUnique.mockResolvedValue({
            name: "Client", clientId: "client-1", icon: null, disabled: false,
            redirectUris: ["https://client.example/cb"], clientDiscoveryId: null,
        })
    })

    it("sends a 2FA-enrolled but unverified session to the 2FA challenge", async () => {
        mocks.getSession.mockResolvedValue({
            user: { id: "u1", email: "u@example.com", twoFactorEnabled: true },
            twoFactorVerified: false,
        })

        await expect(OAuthConsentPage({ searchParams })).rejects.toThrow(
            `REDIRECT:/2fa?callbackUrl=${encodeURIComponent(`/oauth/consent?${signedQuery}`)}`,
        )
        expect(mocks.findUnique).not.toHaveBeenCalled()
    })

    it("renders the consent form for a 2FA-verified session", async () => {
        mocks.getSession.mockResolvedValue({
            user: { id: "u1", email: "u@example.com", twoFactorEnabled: true },
            twoFactorVerified: true,
        })

        await expect(OAuthConsentPage({ searchParams })).resolves.toBeTruthy()
        expect(mocks.redirect).not.toHaveBeenCalled()
    })

    it("sends a signed-out user to login with a callbackUrl back to consent", async () => {
        mocks.getSession.mockResolvedValue(null)

        await expect(OAuthConsentPage({ searchParams })).rejects.toThrow(
            `REDIRECT:/login?callbackUrl=${encodeURIComponent(`/oauth/consent?${signedQuery}`)}`,
        )
    })

    it("renders an expiry notice instead of consent for an invalid or expired signed query", async () => {
        mocks.parseConsentRequest.mockResolvedValue(null)
        mocks.getSession.mockResolvedValue({ user: { id: "u1", twoFactorEnabled: false }, twoFactorVerified: false })
        await expect(OAuthConsentPage({ searchParams })).resolves.toBeTruthy()
        expect(mocks.findUnique).not.toHaveBeenCalled()
    })

    it("404s for a disabled client", async () => {
        mocks.getSession.mockResolvedValue({ user: { id: "u1", twoFactorEnabled: false }, twoFactorVerified: false })
        mocks.findUnique.mockResolvedValue({
            name: "Client", clientId: "client-1", icon: null, disabled: true, redirectUris: [], clientDiscoveryId: null,
        })
        await expect(OAuthConsentPage({ searchParams })).rejects.toThrow("NOT_FOUND")
    })
})
