import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

const { toastError, toastSuccess, revokeConnectedAppAction } = vi.hoisted(() => ({
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    revokeConnectedAppAction: vi.fn(),
}))
vi.mock("sonner", () => ({ toast: { error: toastError, success: toastSuccess } }))
vi.mock("@/actions/connected-apps", () => ({ revokeConnectedAppAction }))

import { ConnectedApps } from "@/app/(dashboard)/dashboard/settings/connected-apps"

const claude = {
    clientId: "https://claude.ai/oauth/mcp-oauth-client-metadata",
    name: "Claude",
    publisher: "claude.ai",
    scopes: [
        { key: "anon.li:aliases", label: "Aliases" },
        { key: "anon.li:drops", label: "Drops" },
    ],
    connectedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    lastActiveAt: new Date(Date.now() - 60 * 60 * 1000),
}

afterEach(() => {
    cleanup()
    vi.clearAllMocks()
})

describe("ConnectedApps", () => {
    it("shows an empty state when no apps are connected", () => {
        render(<ConnectedApps apps={[]} />)

        expect(screen.getByText("No connected apps")).toBeTruthy()
        expect(screen.queryByRole("button", { name: /revoke/i })).toBeNull()
    })

    it("lists each app with its granted scopes in human terms", () => {
        render(<ConnectedApps apps={[claude]} />)

        expect(screen.getByText("Claude")).toBeTruthy()
        expect(screen.getByText("claude.ai")).toBeTruthy()
        const scopes = within(screen.getByRole("list", { name: "Access granted to Claude" }))
        expect(scopes.getByText("Aliases")).toBeTruthy()
        expect(scopes.getByText("Drops")).toBeTruthy()
        expect(screen.getByText(/Connected .* · Last active/)).toBeTruthy()
    })

    it("revokes after confirmation and reports success", async () => {
        revokeConnectedAppAction.mockResolvedValue({ success: true })
        render(<ConnectedApps apps={[claude]} />)

        fireEvent.click(screen.getByRole("button", { name: "Revoke access for Claude" }))
        expect(revokeConnectedAppAction).not.toHaveBeenCalled()

        const dialog = await screen.findByRole("alertdialog")
        expect(within(dialog).getByText("Revoke access for Claude?")).toBeTruthy()
        fireEvent.click(within(dialog).getByRole("button", { name: "Revoke access" }))

        await waitFor(() => expect(revokeConnectedAppAction).toHaveBeenCalledWith(claude.clientId))
        await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Claude can no longer access your account"))
        await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    })

    it("disables the controls while revoking and surfaces failures", async () => {
        let resolve: (value: { error: string }) => void = () => {}
        revokeConnectedAppAction.mockReturnValue(new Promise((r) => { resolve = r }))
        render(<ConnectedApps apps={[claude]} />)

        fireEvent.click(screen.getByRole("button", { name: "Revoke access for Claude" }))
        const dialog = await screen.findByRole("alertdialog")
        fireEvent.click(within(dialog).getByRole("button", { name: "Revoke access" }))

        await waitFor(() => {
            const confirm = within(dialog).getByRole("button", { name: /Revoking/ }) as HTMLButtonElement
            expect(confirm.disabled).toBe(true)
        })
        expect((within(dialog).getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true)

        resolve({ error: "Too many requests. Please try again later." })

        await waitFor(() => expect(toastError).toHaveBeenCalledWith("Too many requests. Please try again later."))
        expect(toastSuccess).not.toHaveBeenCalled()
        // The dialog stays open so the user can retry.
        expect(screen.getByRole("alertdialog")).toBeTruthy()
    })
})
