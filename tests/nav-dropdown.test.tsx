/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { NavDropdown } from "@/components/ui/nav-dropdown"

afterEach(() => cleanup())

function setup() {
    render(
        <NavDropdown trigger="Products">
            <a href="#alias">Alias</a>
        </NavDropdown>,
    )
    const trigger = screen.getByRole("button", { name: "Products" })
    const link = screen.getByText("Alias")
    const panel = document.getElementById(trigger.getAttribute("aria-controls")!)!
    return { trigger, link, panel }
}

describe("NavDropdown", () => {
    it("exposes popup state via aria-expanded", () => {
        const { trigger } = setup()
        expect(trigger.getAttribute("aria-haspopup")).toBe("true")
        expect(trigger.getAttribute("aria-expanded")).toBe("false")

        fireEvent.focus(trigger)
        expect(trigger.getAttribute("aria-expanded")).toBe("true")
    })

    it("closes after a link inside the panel is clicked", () => {
        const { trigger, link, panel } = setup()
        const wrapper = trigger.parentElement!

        fireEvent.mouseEnter(wrapper)
        act(() => link.focus())
        expect(trigger.getAttribute("aria-expanded")).toBe("true")
        expect(panel.className).toContain("group-focus-within:block")

        fireEvent.click(link)

        expect(trigger.getAttribute("aria-expanded")).toBe("false")
        expect(panel.className).not.toContain("group-focus-within:block")
        expect(panel.className).not.toContain("group-hover:block")
        expect(document.activeElement).not.toBe(link)

        // Leaving the menu re-arms it for the next hover.
        fireEvent.mouseLeave(wrapper)
        expect(panel.className).toContain("group-hover:block")
    })

    it("closes on Escape and returns focus to the trigger", () => {
        const { trigger, link } = setup()
        act(() => link.focus())
        expect(trigger.getAttribute("aria-expanded")).toBe("true")

        fireEvent.keyDown(link, { key: "Escape" })

        expect(trigger.getAttribute("aria-expanded")).toBe("false")
        expect(document.activeElement).toBe(trigger)

        fireEvent.click(trigger)
        expect(trigger.getAttribute("aria-expanded")).toBe("true")
    })
})
