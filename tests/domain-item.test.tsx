/**
 * @vitest-environment jsdom
 *
 * DomainItem a11y/privacy: the expand chevron is labelled and reports its
 * state, the collapsed panel is inert (copy buttons not focusable), and no
 * third-party favicon request leaks the user's domain.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

vi.mock("@/actions/domain", () => ({
    verifyDomainAction: vi.fn(),
    deleteDomainAction: vi.fn(),
    regenerateDkimAction: vi.fn(),
}))

import { DomainItem } from "@/components/domain"

const domain = {
    id: "d1",
    domain: "private-example.com",
    verified: true,
    ownershipVerified: true,
    mxVerified: true,
    spfVerified: true,
    dnsVerified: true,
    verificationToken: "tok",
    dkimPublicKey: null,
    dkimSelector: "default",
    dkimVerified: true,
}

describe("DomainItem", () => {
    afterEach(cleanup)

    it("labels the chevron, reports aria-expanded, and makes the collapsed panel inert", () => {
        const { container } = render(<DomainItem domain={domain} />)

        const toggle = screen.getByRole("button", { name: "Show DNS setup" })
        expect(toggle.getAttribute("aria-expanded")).toBe("false")
        const panel = container.querySelector(`#${toggle.getAttribute("aria-controls")}`)
        expect(panel?.hasAttribute("inert")).toBe(true)

        fireEvent.click(toggle)
        const hide = screen.getByRole("button", { name: "Hide DNS setup" })
        expect(hide.getAttribute("aria-expanded")).toBe("true")
        expect(panel?.hasAttribute("inert")).toBe(false)
    })

    it("does not load a third-party favicon for the domain", () => {
        const { container } = render(<DomainItem domain={domain} />)

        expect(container.querySelector("img")).toBeNull()
        expect(container.innerHTML).not.toContain("google.com")
    })

    it("flags a revoked domain", () => {
        render(<DomainItem domain={{ ...domain, verified: false, unverifiedAt: new Date() }} />)

        expect(screen.getByText(/Verification lost/)).toBeDefined()
    })
})
