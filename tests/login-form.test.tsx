/**
 * @vitest-environment jsdom
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const authMocks = vi.hoisted(() => ({
    signInSocial: vi.fn(),
    signInMagicLink: vi.fn(),
}))

const analyticsMocks = vi.hoisted(() => ({
    registrationStarted: vi.fn(),
    loginStarted: vi.fn(),
}))

const originalTurnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

vi.mock("@/lib/auth-client", () => ({
    authClient: {
        signIn: {
            social: authMocks.signInSocial,
            magicLink: authMocks.signInMagicLink,
        },
    },
}))

vi.mock("@/lib/analytics", () => ({
    analytics: {
        registrationStarted: analyticsMocks.registrationStarted,
        loginStarted: analyticsMocks.loginStarted,
    },
}))

vi.mock("@/components/ui/turnstile", () => ({
    Turnstile: ({ onVerify }: { onVerify: (token: string) => void }) => (
        <button type="button" onClick={() => onVerify("captcha-token")}>
            Complete captcha
        </button>
    ),
}))

beforeEach(() => {
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
    vi.resetModules()
    authMocks.signInSocial.mockResolvedValue({ data: {}, error: null })
    authMocks.signInMagicLink.mockResolvedValue({ data: {}, error: null })
})

afterEach(() => {
    cleanup()
    vi.clearAllMocks()
})

afterAll(() => {
    if (originalTurnstileSiteKey === undefined) {
        delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
    } else {
        process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = originalTurnstileSiteKey
    }
})

describe("LoginForm", () => {
    it("shows magic email and social sign-in without password fields", async () => {
        const { LoginForm } = await import("@/components/auth/login-form")

        render(<LoginForm mode="login" />)

        expect(screen.getByLabelText("Email address")).toBeTruthy()
        expect(screen.getByRole("button", { name: "Send magic link" })).toBeTruthy()
        expect(screen.getByRole("button", { name: "Google" })).toBeTruthy()
        expect(screen.getByRole("button", { name: "GitHub" })).toBeTruthy()
        expect(screen.queryByLabelText("Password")).toBeNull()
        expect(screen.queryByLabelText("Confirm password")).toBeNull()
    })

    it("sends login magic links to the vault setup handoff", async () => {
        const onEmailSentChange = vi.fn()
        const { LoginForm } = await import("@/components/auth/login-form")

        render(<LoginForm mode="login" onEmailSentChange={onEmailSentChange} />)

        fireEvent.change(screen.getByLabelText("Email address"), {
            target: { value: " user@example.com " },
        })
        fireEvent.click(screen.getByRole("button", { name: "Send magic link" }))

        await waitFor(() => {
            expect(authMocks.signInMagicLink).toHaveBeenCalledWith({
                email: "user@example.com",
                callbackURL: "/setup",
                newUserCallbackURL: "/setup",
            })
        })

        expect(analyticsMocks.loginStarted).toHaveBeenCalledWith("magic_link")
        expect(screen.getByText("Check your inbox")).toBeTruthy()
        expect(screen.getByText("user@example.com")).toBeTruthy()
        await waitFor(() => {
            expect(onEmailSentChange).toHaveBeenLastCalledWith(true)
        })
    })

    it("sends registration magic links with the requested dashboard callback", async () => {
        const { LoginForm } = await import("@/components/auth/login-form")

        render(<LoginForm mode="register" callbackUrl="/dashboard/drop" />)

        fireEvent.change(screen.getByLabelText("Email address"), {
            target: { value: "new@example.com" },
        })
        fireEvent.click(screen.getByRole("button", { name: "Create account" }))

        await waitFor(() => {
            expect(authMocks.signInMagicLink).toHaveBeenCalledWith({
                email: "new@example.com",
                name: "anon.li user",
                callbackURL: "/setup?callbackUrl=%2Fdashboard%2Fdrop",
                newUserCallbackURL: "/setup?callbackUrl=%2Fdashboard%2Fdrop",
            })
        })

        expect(analyticsMocks.registrationStarted).toHaveBeenCalledWith("magic_link")
        expect(screen.queryByLabelText("Password")).toBeNull()
    })

    it("routes social sign-in through vault setup", async () => {
        const { LoginForm } = await import("@/components/auth/login-form")

        render(<LoginForm mode="login" callbackUrl="/dashboard/settings" />)

        fireEvent.click(screen.getByRole("button", { name: "Google" }))

        await waitFor(() => {
            expect(authMocks.signInSocial).toHaveBeenCalledWith({
                provider: "google",
                callbackURL: "/setup?callbackUrl=%2Fdashboard%2Fsettings",
            })
        })
        expect(analyticsMocks.loginStarted).toHaveBeenCalledWith("google")
    })

    it("sends turnstile response header with magic link requests when configured", async () => {
        process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site-key"
        vi.resetModules()

        try {
            const { LoginForm } = await import("@/components/auth/login-form")

            render(<LoginForm mode="login" />)

            fireEvent.change(screen.getByLabelText("Email address"), {
                target: { value: "user@example.com" },
            })
            expect(screen.queryByRole("button", { name: "Complete captcha" })).toBeNull()
            fireEvent.click(screen.getByRole("button", { name: "Send magic link" }))
            expect(authMocks.signInMagicLink).not.toHaveBeenCalled()
            expect(screen.queryByText("Please complete the verification challenge.")).toBeNull()
            fireEvent.click(screen.getByRole("button", { name: "Complete captcha" }))
            await waitFor(() => {
                expect(screen.queryByRole("button", { name: "Complete captcha" })).toBeNull()
            })

            await waitFor(() => {
                expect(authMocks.signInMagicLink).toHaveBeenCalledWith({
                    email: "user@example.com",
                    callbackURL: "/setup",
                    newUserCallbackURL: "/setup",
                    fetchOptions: {
                        headers: { "x-captcha-response": "captcha-token" },
                    },
                })
            })
        } finally {
            delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
            vi.resetModules()
        }
    })
})
