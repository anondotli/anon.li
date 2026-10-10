/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Turnstile } from "@/components/ui/turnstile"

const SCRIPT_SELECTOR = 'script[src*="challenges.cloudflare.com/turnstile"]'

type TurnstileWindow = Window & { turnstile?: unknown }

function installTurnstile() {
    const render = vi.fn(() => "widget-id")
    ;(window as TurnstileWindow).turnstile = { render, remove: vi.fn(), reset: vi.fn() }
    return render
}

beforeEach(() => {
    vi.useFakeTimers()
})

afterEach(() => {
    cleanup()
    vi.useRealTimers()
    document.head.innerHTML = ""
    document.body.innerHTML = ""
    delete (window as TurnstileWindow).turnstile
})

describe("Turnstile retry", () => {
    it("replaces the stale script tag when retrying after a load timeout", async () => {
        render(<Turnstile siteKey="site-key" onVerify={vi.fn()} />)

        const firstScript = document.querySelector(SCRIPT_SELECTOR)
        expect(firstScript).not.toBeNull()

        await act(async () => {
            vi.advanceTimersByTime(10_000)
        })
        expect(screen.getByText("Captcha failed to load")).toBeTruthy()

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /try again/i }))
        })

        const scripts = document.querySelectorAll(SCRIPT_SELECTOR)
        expect(scripts).toHaveLength(1)
        expect(scripts[0]).not.toBe(firstScript)
        expect(screen.getByText("Loading captcha...")).toBeTruthy()

        // The fresh script loading must render the widget.
        const renderWidget = installTurnstile()
        await act(async () => {
            scripts[0]!.dispatchEvent(new Event("load"))
        })
        expect(renderWidget).toHaveBeenCalledTimes(1)
    })

    it("recovers when the script loads after the timeout already fired", async () => {
        render(<Turnstile siteKey="site-key" onVerify={vi.fn()} />)
        const script = document.querySelector(SCRIPT_SELECTOR)!

        await act(async () => {
            vi.advanceTimersByTime(10_000)
        })
        expect(screen.getByText("Captcha failed to load")).toBeTruthy()

        const renderWidget = installTurnstile()
        await act(async () => {
            script.dispatchEvent(new Event("load"))
        })

        expect(screen.queryByText("Captcha failed to load")).toBeNull()
        expect(screen.queryByText("Loading captcha...")).toBeNull()
        expect(renderWidget).toHaveBeenCalledTimes(1)
    })

    it("does not get stuck loading when retrying after turnstile became available", async () => {
        render(<Turnstile siteKey="site-key" onVerify={vi.fn()} />)

        await act(async () => {
            vi.advanceTimersByTime(10_000)
        })

        // Script became available without its load listener firing (e.g. loaded
        // by another instance); the retry must render rather than wait forever.
        const renderWidget = installTurnstile()
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /try again/i }))
        })

        expect(screen.queryByText("Loading captcha...")).toBeNull()
        expect(renderWidget).toHaveBeenCalledTimes(1)
    })
})
