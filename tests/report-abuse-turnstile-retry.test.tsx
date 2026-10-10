/**
 * @vitest-environment jsdom
 *
 * Turnstile tokens are single-use: after the server rejects a submission the
 * form must fetch a fresh challenge so the retry can succeed, and must not
 * auto-resubmit (an always-failing request would otherwise loop).
 */
import * as React from "react"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({
    useSearchParams: () => new URLSearchParams("service=alias&id=spam@anon.li"),
}))

// Minimal Select: SelectItems become buttons that set the value.
vi.mock("@/components/ui/select", () => {
    const Ctx = React.createContext<(value: string) => void>(() => {})
    return {
        Select: ({ onValueChange, children }: { onValueChange: (v: string) => void; children: React.ReactNode }) => (
            <Ctx.Provider value={onValueChange}>{children}</Ctx.Provider>
        ),
        SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
        SelectValue: () => null,
        SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
        SelectItem: ({ value }: { value: string }) => {
            const set = React.useContext(Ctx)
            return <button type="button" onClick={() => set(value)}>{`pick-${value}`}</button>
        },
    }
})

let tokenCounter = 0
vi.mock("@/components/ui/turnstile", () => ({
    Turnstile: ({ onVerify }: { onVerify: (token: string) => void }) => (
        <button type="button" onClick={() => onVerify(`token-${++tokenCounter}`)}>solve-turnstile</button>
    ),
}))

import { ReportAbuseForm } from "@/components/shared/report-abuse-form"

const fetchMock = vi.fn()

function fillForm() {
    fireEvent.click(screen.getByText("pick-spam"))
    fireEvent.change(screen.getByLabelText("Description *"), {
        target: { value: "This alias is sending unsolicited bulk spam to many people." },
    })
}

describe("ReportAbuseForm Turnstile retry", () => {
    beforeEach(() => {
        tokenCounter = 0
        fetchMock.mockReset()
        vi.stubGlobal("fetch", fetchMock)
    })

    afterEach(() => {
        cleanup()
        vi.unstubAllGlobals()
    })

    it("requests a fresh token after a server error and retries with it", async () => {
        fetchMock
            .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Turnstile verification failed" }), { status: 400 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ trackingToken: "a".repeat(32) }), { status: 200 }))

        render(<ReportAbuseForm />)
        fillForm()

        // First submit asks for a challenge; solving it auto-submits.
        fireEvent.click(screen.getByRole("button", { name: /submit report/i }))
        await act(async () => {
            fireEvent.click(await screen.findByText("solve-turnstile"))
        })
        expect((await screen.findByRole("alert")).textContent).toContain("Turnstile verification failed")
        expect(fetchMock).toHaveBeenCalledTimes(1)

        // A fresh challenge is shown; solving it does NOT auto-resubmit.
        await act(async () => {
            fireEvent.click(await screen.findByText("solve-turnstile"))
        })
        expect(fetchMock).toHaveBeenCalledTimes(1)

        // The explicit retry uses the new token.
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /submit report/i }))
        })
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
        const body = JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body))
        expect(body.turnstileToken).toBe("token-2")
    })
})
