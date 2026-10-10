/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { isInternalCryptoFailureStatus, isInternalCryptoReviewStatus } from "@/lib/crypto-payment-status"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
})

describe("needs_review crypto payment status", () => {
    it("is a review state, not a failure", () => {
        expect(isInternalCryptoReviewStatus("needs_review")).toBe(true)
        expect(isInternalCryptoFailureStatus("needs_review")).toBe(false)
        expect(isInternalCryptoReviewStatus("underpaid")).toBe(false)
    })

    it("shows reassuring review copy and stops polling", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "needs_review" }), {
            status: 200,
            headers: { "content-type": "application/json" },
        }))
        vi.stubGlobal("fetch", fetchMock)

        const { CryptoSuccessContent } = await import("@/app/(dashboard)/dashboard/billing/crypto-success/crypto-success-content")
        render(<CryptoSuccessContent orderId="crypto_abc" />)

        expect(await screen.findByText("Payment Under Review")).toBeTruthy()
        expect(screen.getByText(/We received your payment but need to review it/)).toBeTruthy()
        expect(screen.getByText(/No\s+action is needed/)).toBeTruthy()
        expect(screen.queryByText("Payment Failed")).toBeNull()
        expect(screen.getByRole("button", { name: "Back to Billing" })).toBeTruthy()
        // Terminal for this page: no further polling after the review state.
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })
})
