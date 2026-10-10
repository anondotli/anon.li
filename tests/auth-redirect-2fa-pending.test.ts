/**
 * @vitest-environment node
 *
 * A signed-in session that still owes its 2FA challenge (e.g. magic link with
 * TOTP enrolled) must be routed through /2fa — carrying the destination — and
 * never straight to an invitation or a login callback.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    redirect: vi.fn((url: string) => {
        throw new Error(`REDIRECT:${url}`)
    }),
}))

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }))
vi.mock("@/auth", () => ({ auth: mocks.auth }))
vi.mock("@/components/organization/accept-invitation-client", () => ({ AcceptInvitationClient: () => null }))
vi.mock("@/app/(auth)/login/login-content", () => ({ LoginPageContent: () => null }))

import AcceptInvitationPage from "@/app/accept-invitation/[id]/page"
import LoginPage from "@/app/(auth)/login/page"

const pending = { user: { id: "u1", twoFactorEnabled: true }, twoFactorVerified: false }
const verified = { user: { id: "u1", twoFactorEnabled: true }, twoFactorVerified: true }

beforeEach(() => {
    vi.clearAllMocks()
})

describe("accept-invitation page", () => {
    it("sends a 2FA-pending session to /2fa with the invitation as callback", async () => {
        mocks.auth.mockResolvedValue(pending)
        await expect(AcceptInvitationPage({ params: Promise.resolve({ id: "inv_1" }) }))
            .rejects.toThrow(`REDIRECT:/2fa?callbackUrl=${encodeURIComponent("/accept-invitation/inv_1")}`)
    })

    it("renders for a verified session", async () => {
        mocks.auth.mockResolvedValue(verified)
        await expect(AcceptInvitationPage({ params: Promise.resolve({ id: "inv_1" }) })).resolves.toBeTruthy()
    })
})

describe("login page with an existing session", () => {
    it("routes a 2FA-pending session through /2fa, keeping the sanitized callback", async () => {
        mocks.auth.mockResolvedValue(pending)
        await expect(LoginPage({ searchParams: Promise.resolve({ callbackUrl: "/accept-invitation/inv_1" }) }))
            .rejects.toThrow(`REDIRECT:/2fa?callbackUrl=${encodeURIComponent("/accept-invitation/inv_1")}`)
    })

    it("sends a verified session straight to the sanitized callback", async () => {
        mocks.auth.mockResolvedValue(verified)
        await expect(LoginPage({ searchParams: Promise.resolve({ callbackUrl: "/accept-invitation/inv_1" }) }))
            .rejects.toThrow("REDIRECT:/accept-invitation/inv_1")
    })

    it("drops an unsafe callback", async () => {
        mocks.auth.mockResolvedValue(verified)
        await expect(LoginPage({ searchParams: Promise.resolve({ callbackUrl: "https://evil.example" }) }))
            .rejects.toThrow("REDIRECT:/dashboard/alias")
    })
})
