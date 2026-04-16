/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, render, screen } from "@testing-library/react"

const mockUseVault = vi.fn()

vi.mock("@/components/vault/vault-provider", () => ({
    useVault: () => mockUseVault(),
}))

vi.mock("@/components/vault/unlock-prompt", () => ({
    UnlockPrompt: () => <div>unlock prompt</div>,
}))

describe("VaultGate", () => {
    beforeEach(() => {
        vi.useFakeTimers()
        mockUseVault.mockReset()
    })

    afterEach(() => {
        vi.runOnlyPendingTimers()
        vi.useRealTimers()
    })

    it("keeps the unlock prompt visible briefly after a successful unlock", async () => {
        mockUseVault.mockReturnValue({ status: "locked" })

        const { VaultGate } = await import("@/components/vault/vault-gate")
        const { rerender } = render(
            <VaultGate>
                <div>vault content</div>
            </VaultGate>,
        )

        expect(screen.getByText("unlock prompt")).toBeTruthy()
        expect(screen.queryByText("vault content")).toBeNull()

        mockUseVault.mockReturnValue({ status: "unlocked" })

        rerender(
            <VaultGate>
                <div>vault content</div>
            </VaultGate>,
        )

        expect(screen.getByText("unlock prompt")).toBeTruthy()
        expect(screen.queryByText("vault content")).toBeNull()

        act(() => {
            vi.advanceTimersByTime(799)
        })

        expect(screen.queryByText("vault content")).toBeNull()

        act(() => {
            vi.advanceTimersByTime(1)
        })

        expect(screen.queryByText("unlock prompt")).toBeNull()
        expect(screen.getByText("vault content")).toBeTruthy()
    })
})
