/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type * as React from "react"

const navigationMocks = vi.hoisted(() => ({
    useSearchParams: vi.fn(),
}))

const authMocks = vi.hoisted(() => ({
    resetPassword: vi.fn(),
}))

const actionMocks = vi.hoisted(() => ({
    requestPasswordResetAction: vi.fn(),
}))

vi.mock("next/navigation", () => ({
    useSearchParams: navigationMocks.useSearchParams,
}))

vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}))

vi.mock("@/lib/auth-client", () => ({
    authClient: {
        resetPassword: authMocks.resetPassword,
    },
}))

vi.mock("@/actions/session", () => ({
    requestPasswordResetAction: actionMocks.requestPasswordResetAction,
}))

beforeEach(() => {
    navigationMocks.useSearchParams.mockReturnValue(new URLSearchParams())
    authMocks.resetPassword.mockResolvedValue({ data: {}, error: null })
    actionMocks.requestPasswordResetAction.mockResolvedValue({ success: true, data: { message: "ok" } })
})

afterEach(() => {
    cleanup()
    vi.clearAllMocks()
})

describe("ResetPasswordContent", () => {
    it("requests a reset email when opened without a token", async () => {
        const { ResetPasswordContent } = await import("@/app/(auth)/reset/reset-password-content")

        render(<ResetPasswordContent />)

        expect(screen.getByText("Reset your password")).toBeTruthy()
        expect(screen.getByLabelText("Email address")).toBeTruthy()
        expect(screen.queryByLabelText("New password")).toBeNull()

        fireEvent.change(screen.getByLabelText("Email address"), {
            target: { value: " user@example.com " },
        })
        fireEvent.click(screen.getByRole("button", { name: "Send reset link" }))

        await waitFor(() => {
            expect(actionMocks.requestPasswordResetAction).toHaveBeenCalledWith("user@example.com")
        })

        expect(authMocks.resetPassword).not.toHaveBeenCalled()
        expect(screen.getByText("Check your inbox")).toBeTruthy()
    })

    it("resets a password when opened with a token", async () => {
        navigationMocks.useSearchParams.mockReturnValue(new URLSearchParams("token=reset-token"))
        const { ResetPasswordContent } = await import("@/app/(auth)/reset/reset-password-content")

        render(<ResetPasswordContent />)

        expect(screen.getByLabelText("New password")).toBeTruthy()
        expect(screen.getByLabelText("Confirm password")).toBeTruthy()
        expect(screen.queryByLabelText("Email address")).toBeNull()

        fireEvent.change(screen.getByLabelText("New password"), {
            target: { value: "new-password-123" },
        })
        fireEvent.change(screen.getByLabelText("Confirm password"), {
            target: { value: "new-password-123" },
        })
        fireEvent.click(screen.getByRole("button", { name: "Reset password" }))

        await waitFor(() => {
            expect(authMocks.resetPassword).toHaveBeenCalledWith({
                token: "reset-token",
                newPassword: "new-password-123",
            })
        })

        expect(actionMocks.requestPasswordResetAction).not.toHaveBeenCalled()
        expect(screen.getByText("Password reset")).toBeTruthy()
    })
})
