/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const authMocks = vi.hoisted(() => ({
    signInSocial: vi.fn(),
    signInMagicLink: vi.fn(),
}))

const analyticsMocks = vi.hoisted(() => ({
    registrationStarted: vi.fn(),
    loginStarted: vi.fn(),
}))

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
    vi.resetModules()
    authMocks.signInSocial.mockResolvedValue({ data: {}, error: null })
    authMocks.signInMagicLink.mockResolvedValue({ data: {}, error: null })
})

afterEach(() => {
    cleanup()
    vi.clearAllMocks()
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

    it("sends login magic links to the default dashboard destination", async () => {
        const onEmailSentChange = vi.fn()
        const { LoginForm } = await import("@/components/auth/login-form")

        render(<LoginForm mode="login" onEmailSentChange={onEmailSentChange} />)

        fireEvent.change(screen.getByLabelText("Email address"), {
            target: { value: " user@example.com " },
        })
        fireEvent.click(screen.getByRole("button", { name: "Send magic link" }))
        fireEvent.click(screen.getByRole("button", { name: "Complete captcha" }))

        await waitFor(() => {
            expect(authMocks.signInMagicLink).toHaveBeenCalledWith({
                email: "user@example.com",
                callbackURL: "/dashboard/alias",
                newUserCallbackURL: "/dashboard/alias",
                fetchOptions: {
                    headers: { "x-captcha-response": "captcha-token" },
                },
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
        fireEvent.click(screen.getByRole("button", { name: "Complete captcha" }))

        await waitFor(() => {
            expect(authMocks.signInMagicLink).toHaveBeenCalledWith({
                email: "new@example.com",
                name: "anon.li user",
                callbackURL: "/dashboard/drop",
                newUserCallbackURL: "/dashboard/drop",
                fetchOptions: {
                    headers: { "x-captcha-response": "captcha-token" },
                },
            })
        })

        expect(analyticsMocks.registrationStarted).toHaveBeenCalledWith("magic_link")
        expect(screen.queryByLabelText("Password")).toBeNull()
    })

    it("routes social sign-in to the requested dashboard destination", async () => {
        const { LoginForm } = await import("@/components/auth/login-form")

        render(<LoginForm mode="login" callbackUrl="/dashboard/settings" />)

        fireEvent.click(screen.getByRole("button", { name: "Google" }))

        await waitFor(() => {
            expect(authMocks.signInSocial).toHaveBeenCalledWith({
                provider: "google",
                callbackURL: "/dashboard/settings",
            })
        })
        expect(analyticsMocks.loginStarted).toHaveBeenCalledWith("google")
    })

    it("requires the captcha before sending a magic link", async () => {
        const { LoginForm } = await import("@/components/auth/login-form")

        render(<LoginForm mode="login" />)

        fireEvent.change(screen.getByLabelText("Email address"), {
            target: { value: "user@example.com" },
        })
        expect(screen.queryByRole("button", { name: "Complete captcha" })).toBeNull()
        fireEvent.click(screen.getByRole("button", { name: "Send magic link" }))
        expect(authMocks.signInMagicLink).not.toHaveBeenCalled()
        fireEvent.click(screen.getByRole("button", { name: "Complete captcha" }))
        await waitFor(() => {
            expect(screen.queryByRole("button", { name: "Complete captcha" })).toBeNull()
        })

        await waitFor(() => {
            expect(authMocks.signInMagicLink).toHaveBeenCalledWith({
                email: "user@example.com",
                callbackURL: "/dashboard/alias",
                newUserCallbackURL: "/dashboard/alias",
                fetchOptions: {
                    headers: { "x-captcha-response": "captcha-token" },
                },
            })
        })
    })
})
