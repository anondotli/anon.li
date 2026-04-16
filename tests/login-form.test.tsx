/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

const push = vi.fn()

vi.mock("next/navigation", () => ({
    useRouter: () => ({
        push,
    }),
}))

vi.mock("@/lib/auth-client", () => ({
    authClient: {
        signIn: {
            social: vi.fn(),
            magicLink: vi.fn(),
            email: vi.fn(),
        },
        signUp: {
            email: vi.fn(),
        },
    },
}))

vi.mock("@/actions/session", () => ({
    requestPasswordResetAction: vi.fn(),
}))

vi.mock("@/lib/analytics", () => ({
    analytics: {
        registrationStarted: vi.fn(),
        loginStarted: vi.fn(),
    },
}))

vi.mock("@/lib/vault/crypto", () => ({
    arrayBufferToBase64Url: vi.fn(),
    base64UrlToArrayBuffer: vi.fn(),
    deriveAuthSecret: vi.fn(),
    derivePasswordKEK: vi.fn(),
    unwrapVaultKey: vi.fn(),
}))

vi.mock("@/lib/vault/client", () => ({
    readVaultApiData: vi.fn(),
}))

vi.mock("@/lib/vault/runtime", () => ({
    setVaultRuntime: vi.fn(),
}))

afterEach(() => {
    cleanup()
    push.mockReset()
})

describe("LoginForm", () => {
    it("keeps password sign-in controls visible after the email field loses focus", async () => {
        const { LoginForm } = await import("@/components/auth/login-form")

        render(<LoginForm mode="login" />)

        expect(screen.queryByLabelText("Password")).toBeNull()
        expect(screen.getByRole("button", { name: "Google" })).toBeTruthy()

        const emailInput = screen.getByLabelText("Email address")
        fireEvent.focus(emailInput)

        expect(screen.getByLabelText("Password")).toBeTruthy()
        expect(screen.queryByRole("button", { name: "Google" })).toBeNull()

        fireEvent.blur(emailInput)

        expect(screen.getByLabelText("Password")).toBeTruthy()
        expect(screen.getByRole("button", { name: "Use magic link instead" })).toBeTruthy()
        expect(screen.getByRole("button", { name: "Forgot password?" })).toBeTruthy()
        expect(screen.queryByRole("button", { name: "Google" })).toBeNull()
    })

    it("keeps registration password controls visible after the email field loses focus", async () => {
        const { LoginForm } = await import("@/components/auth/login-form")

        render(<LoginForm mode="register" />)

        expect(screen.queryByLabelText("Password")).toBeNull()
        expect(screen.getByRole("button", { name: "Google" })).toBeTruthy()

        const emailInput = screen.getByLabelText("Email address")
        fireEvent.focus(emailInput)

        expect(screen.getByLabelText("Password")).toBeTruthy()
        expect(screen.queryByRole("button", { name: "Google" })).toBeNull()

        fireEvent.blur(emailInput)

        expect(screen.getByLabelText("Password")).toBeTruthy()
        expect(screen.queryByRole("button", { name: "Google" })).toBeNull()
    })

    it("returns to an expanded password form after forgot-password mode", async () => {
        const { LoginForm } = await import("@/components/auth/login-form")

        render(<LoginForm mode="login" initialView="forgot-password" />)

        fireEvent.click(screen.getByRole("button", { name: "Back to sign in" }))

        expect(screen.getByLabelText("Password")).toBeTruthy()
        expect(screen.getByRole("button", { name: "Use magic link instead" })).toBeTruthy()
    })
})
