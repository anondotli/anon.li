import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }))
vi.mock("sonner", () => ({ toast: { error: toastError } }))

import { ConsentForm } from "@/app/(auth)/oauth/consent/consent-form"

const oauthQuery = "client_id=client-1&scope=anon.li%3Aaliases&sig=abc%3D"

function renderForm() {
    render(
        <ConsentForm
            oauthQuery={oauthQuery}
            clientName="Claude"
            publisher={null}
            redirectOrigins={["https://claude.ai"]}
            scopes={[{ key: "anon.li:aliases", description: "Aliases" }]}
            userEmail="u@example.com"
        />,
    )
}

afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    toastError.mockClear()
})

describe("ConsentForm (better-auth 1.7 consent endpoint)", () => {
    it("posts the signed oauth_query with the decision", async () => {
        const fetchMock = vi.fn(async () => Response.json({ error: "access_denied", error_description: "Denied by test" }, { status: 400 }))
        vi.stubGlobal("fetch", fetchMock)
        renderForm()

        fireEvent.click(screen.getByRole("button", { name: "Deny" }))

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
        expect(url).toBe("/api/auth/oauth2/consent")
        expect(JSON.parse(init.body as string)).toEqual({ accept: false, oauth_query: oauthQuery })
        await waitFor(() => expect(toastError).toHaveBeenCalledWith("Denied by test"))
    })

    it("refuses to follow an unsafe redirect returned by the server", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => Response.json({ redirect: true, url: "javascript:alert(1)" })))
        renderForm()

        fireEvent.click(screen.getByRole("button", { name: "Authorize" }))

        await waitFor(() => expect(toastError).toHaveBeenCalledWith(
            "Authorization succeeded, but the client returned an unsafe redirect URL.",
        ))
    })
})
