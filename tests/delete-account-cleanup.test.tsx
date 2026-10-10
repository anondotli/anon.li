/**
 * @vitest-environment jsdom
 *
 * After a successful account deletion the browser must forget its vault trust
 * (capsule + device key), drop in-memory keys, and tell other tabs to sign out
 * — the same local cleanup sign-out does.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    deleteAccountAction: vi.fn(),
    clearVaultForSignOut: vi.fn(),
    clearVaultRuntime: vi.fn(),
    clearOrgVaultKeyCache: vi.fn(),
    replace: vi.fn(),
}))

vi.mock("@/actions/settings", () => ({ deleteAccountAction: mocks.deleteAccountAction }))
vi.mock("@/lib/vault/client", () => ({ clearVaultForSignOut: mocks.clearVaultForSignOut }))
vi.mock("@/lib/vault/runtime", () => ({ clearVaultRuntime: mocks.clearVaultRuntime }))
vi.mock("@/lib/vault/org-vault-client", () => ({ clearOrgVaultKeyCache: mocks.clearOrgVaultKeyCache }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { DeleteAccountSection } from "@/app/(dashboard)/dashboard/settings/delete-account"

const originalLocation = window.location

async function confirmDeletion() {
    render(<DeleteAccountSection />)
    fireEvent.click(screen.getByRole("button", { name: /delete/i }))
    fireEvent.change(await screen.findByPlaceholderText("Type DELETE here"), { target: { value: "DELETE" } })
    await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Delete Account" }))
    })
}

describe("DeleteAccountSection", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.clearVaultForSignOut.mockResolvedValue(undefined)
        Object.defineProperty(window, "location", {
            configurable: true,
            value: { ...originalLocation, replace: mocks.replace },
        })
    })

    afterEach(() => {
        cleanup()
        Object.defineProperty(window, "location", { configurable: true, value: originalLocation })
    })

    it("clears local vault state and signs other tabs out after deletion", async () => {
        mocks.deleteAccountAction.mockResolvedValue({ success: true })

        await confirmDeletion()

        expect(mocks.clearVaultRuntime).toHaveBeenCalled()
        expect(mocks.clearOrgVaultKeyCache).toHaveBeenCalled()
        expect(mocks.clearVaultForSignOut).toHaveBeenCalledWith("delete-account")
        expect(mocks.replace).toHaveBeenCalledWith("/")
    })

    it("keeps vault state when deletion fails", async () => {
        mocks.deleteAccountAction.mockResolvedValue({ error: "nope" })

        await confirmDeletion()

        expect(mocks.clearVaultForSignOut).not.toHaveBeenCalled()
        expect(mocks.replace).not.toHaveBeenCalled()
    })
})
