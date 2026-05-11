/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, waitFor } from "@testing-library/react"
import { Turnstile } from "@/components/ui/turnstile"

const TURNSTILE_SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

afterEach(() => {
    cleanup()
    document.head.innerHTML = ""
    document.body.innerHTML = ""
    delete (window as Window & { turnstile?: unknown }).turnstile
})

describe("Turnstile", () => {
    it("copies the page CSP nonce onto the Cloudflare api.js script", async () => {
        const bootstrapScript = document.createElement("script")
        bootstrapScript.nonce = "test-nonce"
        document.head.appendChild(bootstrapScript)

        render(<Turnstile siteKey="site-key" onVerify={vi.fn()} />)

        await waitFor(() => {
            const turnstileScript = document.querySelector<HTMLScriptElement>(
                `script[src="${TURNSTILE_SCRIPT_SRC}"]`,
            )

            expect(turnstileScript?.nonce).toBe("test-nonce")
        })
    })
})
