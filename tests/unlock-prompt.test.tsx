/**
 * @vitest-environment jsdom
 */
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

const mockUseVault = vi.fn()
const unlockWithPassword = vi.fn()

vi.mock("next/link", () => ({
    default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}))

vi.mock("@/components/vault/vault-provider", () => ({
    useVault: () => mockUseVault(),
}))

vi.mock("@/lib/vault/storage-support", () => ({
    getVaultStorageSupport: () => ({
        trustedBrowser: true,
        vault: true,
    }),
}))

describe("UnlockPrompt", () => {
    beforeEach(() => {
        class ResizeObserverMock {
            observe = vi.fn()
            unobserve = vi.fn()
            disconnect = vi.fn()
        }

        global.ResizeObserver = ResizeObserverMock as typeof ResizeObserver
        window.ResizeObserver = ResizeObserverMock as typeof ResizeObserver
        unlockWithPassword.mockReset()
        mockUseVault.mockReset()
        mockUseVault.mockReturnValue({
            status: "locked",
            error: null,
            unlockWithPassword,
        })
    })

    it("turns the lock indicator red when the password is incorrect", async () => {
        mockUseVault.mockReturnValue({
            status: "error",
            error: "Incorrect password",
            unlockWithPassword,
        })

        const { UnlockPrompt } = await import("@/components/vault/unlock-prompt")
        const { container } = render(<UnlockPrompt />)

        const indicator = container.querySelector('[data-state="error"]')
        const trustBrowserSwitch = screen.getByRole("switch", { name: "Trust this browser" })

        expect(indicator).toBeTruthy()
        expect(screen.getByText("Unlock your vault")).toBeTruthy()
        expect(screen.getByText("Incorrect password")).toBeTruthy()
        expect(trustBrowserSwitch.getAttribute("aria-checked")).toBe("true")
    })

    it("turns the lock indicator green when the vault is unlocked", async () => {
        mockUseVault.mockReturnValue({
            status: "unlocked",
            error: null,
            unlockWithPassword,
        })

        const { UnlockPrompt } = await import("@/components/vault/unlock-prompt")
        const { container } = render(<UnlockPrompt />)

        const indicator = container.querySelector('[data-state="success"]')
        const button = screen.getByRole("button", { name: "Unlocked" }) as HTMLButtonElement

        expect(indicator).toBeTruthy()
        expect(screen.getByText("Vault unlocked")).toBeTruthy()
        expect(button.disabled).toBe(true)
    })
})
