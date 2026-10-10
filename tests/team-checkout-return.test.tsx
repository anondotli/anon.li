/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    params: new URLSearchParams(),
    replace: vi.fn(),
    refresh: vi.fn(),
    checkoutCompleted: vi.fn(),
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock("next/navigation", () => ({
    useSearchParams: () => mocks.params,
    useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}))
vi.mock("@/lib/analytics", () => ({ analytics: { checkoutCompleted: mocks.checkoutCompleted } }))
vi.mock("sonner", () => ({ toast: mocks.toast }))

import {
    TEAM_CHECKOUT_MAX_POLLS,
    TEAM_CHECKOUT_POLL_INTERVAL_MS,
    TeamCheckoutReturn,
} from "@/components/dashboard/team/team-checkout-return"

describe("TeamCheckoutReturn", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.useFakeTimers()
    })

    afterEach(() => {
        cleanup()
        vi.useRealTimers()
    })

    it("does nothing without a checkout return param", () => {
        mocks.params = new URLSearchParams()
        const { container } = render(<TeamCheckoutReturn subscribed={false} />)
        expect(container.textContent).toBe("")
        expect(mocks.replace).not.toHaveBeenCalled()
        expect(mocks.checkoutCompleted).not.toHaveBeenCalled()
    })

    it("tracks checkout_completed once and toasts immediately when the plan is already active", () => {
        mocks.params = new URLSearchParams("success=true")
        const { rerender } = render(<TeamCheckoutReturn subscribed />)
        rerender(<TeamCheckoutReturn subscribed />)

        expect(mocks.checkoutCompleted).toHaveBeenCalledOnce()
        expect(mocks.checkoutCompleted).toHaveBeenCalledWith("card")
        expect(mocks.toast.success).toHaveBeenCalledOnce()
        expect(mocks.replace).toHaveBeenCalledWith("/dashboard/team")
        expect(screen.queryByRole("status")).toBeNull()
    })

    it("shows a pending state and polls until the webhook activates the plan", () => {
        mocks.params = new URLSearchParams("success=true")
        const { rerender } = render(<TeamCheckoutReturn subscribed={false} />)

        expect(screen.getByRole("status").textContent).toContain("Finishing your checkout")
        expect(mocks.toast.success).not.toHaveBeenCalled()

        act(() => { vi.advanceTimersByTime(TEAM_CHECKOUT_POLL_INTERVAL_MS * 2) })
        expect(mocks.refresh).toHaveBeenCalledTimes(2)

        rerender(<TeamCheckoutReturn subscribed />)
        expect(screen.queryByRole("status")).toBeNull()
        expect(mocks.toast.success).toHaveBeenCalledOnce()

        act(() => { vi.advanceTimersByTime(TEAM_CHECKOUT_POLL_INTERVAL_MS * 3) })
        expect(mocks.refresh).toHaveBeenCalledTimes(2)
    })

    it("stops polling after the cap and tells the user activation is still in progress", () => {
        mocks.params = new URLSearchParams("success=true")
        render(<TeamCheckoutReturn subscribed={false} />)

        act(() => { vi.advanceTimersByTime(TEAM_CHECKOUT_POLL_INTERVAL_MS * (TEAM_CHECKOUT_MAX_POLLS + 1)) })

        expect(mocks.refresh).toHaveBeenCalledTimes(TEAM_CHECKOUT_MAX_POLLS)
        expect(mocks.toast.info).toHaveBeenCalledOnce()
        expect(screen.queryByRole("status")).toBeNull()
    })

    it("reports a canceled checkout without tracking a completion", () => {
        mocks.params = new URLSearchParams("canceled=true")
        render(<TeamCheckoutReturn subscribed={false} />)

        expect(mocks.toast.error).toHaveBeenCalledWith("Checkout canceled", expect.any(Object))
        expect(mocks.checkoutCompleted).not.toHaveBeenCalled()
        expect(mocks.replace).toHaveBeenCalledWith("/dashboard/team")
        expect(screen.queryByRole("status")).toBeNull()
    })
})
