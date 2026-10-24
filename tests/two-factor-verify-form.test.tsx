/**
 * @vitest-environment jsdom
 *
 * A successful 2FA login redirects from the server action, which Next.js
 * surfaces to the caller as a rejected promise. The form must treat that as
 * success — not flash "Verification failed" while the router navigates — and
 * still surface real failures.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { redirect } from "next/navigation"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    toast: { success: vi.fn(), error: vi.fn() },
    verifyTwoFactorLogin: vi.fn(),
}))

vi.mock("sonner", () => ({ toast: mocks.toast }))
vi.mock("@/actions/two-factor", () => ({ verifyTwoFactorLogin: mocks.verifyTwoFactorLogin }))

import { TwoFactorVerifyForm } from "@/app/(auth)/2fa/verify-form"

function redirectErrorFor(url: string): unknown {
    try {
        redirect(url)
    } catch (error) {
        return error
    }
}

async function submitBackupCode() {
    render(<TwoFactorVerifyForm callbackUrl="/dashboard/drop" />)
    fireEvent.click(screen.getByRole("button", { name: "Use backup code instead" }))
    fireEvent.change(screen.getByPlaceholderText("XXXXX-XXXXXXXXXXX"), { target: { value: "ABCDE-12345678901" } })
    await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Verify" }))
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    // input-otp constructs a ResizeObserver on mount.
    class ResizeObserverMock {
        observe = vi.fn()
        unobserve = vi.fn()
        disconnect = vi.fn()
    }
    global.ResizeObserver = ResizeObserverMock as typeof ResizeObserver
    window.ResizeObserver = ResizeObserverMock as typeof ResizeObserver
})
afterEach(cleanup)

describe("TwoFactorVerifyForm", () => {
    it("treats the action's redirect as success", async () => {
        mocks.verifyTwoFactorLogin.mockRejectedValueOnce(redirectErrorFor("/dashboard/drop"))

        await submitBackupCode()

        expect(mocks.verifyTwoFactorLogin).toHaveBeenCalledWith("ABCDE-12345678901", "backup", "/dashboard/drop")
        expect(mocks.toast.success).toHaveBeenCalledWith("Verification successful")
        expect(mocks.toast.error).not.toHaveBeenCalled()
        expect(screen.getByText("Success! Redirecting...")).toBeTruthy()
    })

    it("shows the error the action returns", async () => {
        mocks.verifyTwoFactorLogin.mockResolvedValueOnce({ error: "Invalid backup code" })

        await submitBackupCode()

        expect(mocks.toast.error).toHaveBeenCalledWith("Invalid backup code")
        expect(mocks.toast.success).not.toHaveBeenCalled()
    })

    it("shows a retryable error when the action call itself fails", async () => {
        mocks.verifyTwoFactorLogin.mockRejectedValueOnce(new TypeError("Failed to fetch"))

        await submitBackupCode()

        expect(mocks.toast.error).toHaveBeenCalledWith("Verification failed. Please try again.")
        expect(mocks.toast.success).not.toHaveBeenCalled()
    })
})
