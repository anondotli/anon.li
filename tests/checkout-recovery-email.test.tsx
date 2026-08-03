/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { CheckoutRecoveryEmail } from "@/components/email/checkout-recovery"

afterEach(() => {
    cleanup()
})

describe("CheckoutRecoveryEmail", () => {
    it("renders the abandoned plan name and a deep link back to it", () => {
        const { container } = render(<CheckoutRecoveryEmail product="bundle" tier="plus" />)

        expect(screen.getByRole("heading", { name: "Everything OK?" })).toBeDefined()
        expect(container.textContent).toContain("Bundle Plus")

        const cta = screen.getByText("Continue with Bundle Plus")
        expect(cta.getAttribute("href")).toContain("/pricing?highlight=bundle_plus")
    })

    it("capitalizes product and tier for single-product plans", () => {
        render(<CheckoutRecoveryEmail product="form" tier="pro" />)

        const cta = screen.getByText("Continue with Form Pro")
        expect(cta.getAttribute("href")).toContain("/pricing?highlight=form_pro")
    })

    it("falls back to generic copy and the plain pricing page when the plan is unresolved", () => {
        render(<CheckoutRecoveryEmail product={null} tier={null} />)

        const cta = screen.getByText("See plans")
        expect(cta.getAttribute("href")).toContain("/pricing")
        expect(cta.getAttribute("href")).not.toContain("highlight")
    })

    it("shows the unsubscribe link only for growth-email delivery", () => {
        const { container } = render(
            <CheckoutRecoveryEmail product="bundle" tier="plus" unsubscribeUrl="https://anon.li/unsubscribe/tok" />,
        )
        expect(container.textContent).toContain("Unsubscribe from growth emails")

        const { container: transactional } = render(
            <CheckoutRecoveryEmail product="bundle" tier="plus" />,
        )
        expect(transactional.textContent).not.toContain("Unsubscribe from growth emails")
    })
})
