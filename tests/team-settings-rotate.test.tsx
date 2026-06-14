/**
 * @vitest-environment jsdom
 *
 * The "Team encryption key" section inside the Team settings dialog. Rotation is
 * an irreversible crypto operation, so the control must: be gated to owners/admins,
 * require an explicit confirmation, be disabled (with a hint) when the vault is
 * locked, and surface the "rotation recommended" notice after a member is removed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/actions/org-settings", () => ({ setOrgEnforce2FA: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock("@/lib/auth-client", () => ({
    authClient: {
        organization: {
            update: vi.fn(),
            leave: vi.fn(),
            delete: vi.fn(),
            setActive: vi.fn(),
        },
    },
}))

import { TeamSettingsDialog } from "@/components/dashboard/team/team-settings-dialog"

function setup(overrides: Partial<React.ComponentProps<typeof TeamSettingsDialog>> = {}) {
    const onRotateKeys = vi.fn()
    render(
        <TeamSettingsDialog
            open
            onOpenChange={vi.fn()}
            organizationId="org-1"
            name="Acme"
            slug="acme"
            canManage
            isOwner
            hasActiveSubscription={false}
            enforce2FA={false}
            onRotateKeys={onRotateKeys}
            rotating={false}
            keyRotationRecommended={false}
            vaultUnlocked
            keyGeneration={3}
            onSaved={vi.fn()}
            {...overrides}
        />,
    )
    return { onRotateKeys }
}

afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())

describe("TeamSettingsDialog — encryption key", () => {
    it("shows the section with the current key generation", () => {
        setup()
        expect(screen.getByText("Team encryption key")).toBeTruthy()
        expect(screen.getByText(/Current key generation:/)).toBeTruthy()
        expect(screen.getByText("3")).toBeTruthy()
    })

    it("requires confirmation before rotating, then calls onRotateKeys", async () => {
        const { onRotateKeys } = setup()
        // Opening the trigger does not rotate on its own.
        fireEvent.click(screen.getByRole("button", { name: /rotate key/i }))
        expect(onRotateKeys).not.toHaveBeenCalled()

        // Confirm in the alert dialog.
        const confirm = await screen.findByText("Rotate key")
        fireEvent.click(confirm)
        await waitFor(() => expect(onRotateKeys).toHaveBeenCalledTimes(1))
    })

    it("disables rotation with a hint when the vault is locked", () => {
        setup({ vaultUnlocked: false })
        expect((screen.getByRole("button", { name: /rotate key/i }) as HTMLButtonElement).disabled).toBe(true)
        expect(screen.getByText("Unlock your vault to rotate the team key.")).toBeTruthy()
    })

    it("surfaces the rotation-recommended notice after a member was removed", () => {
        setup({ keyRotationRecommended: true })
        expect(screen.getByText(/rotation is recommended/i)).toBeTruthy()
    })

    it("hides the section from members who cannot manage the team", () => {
        setup({ canManage: false, isOwner: false })
        expect(screen.queryByText("Team encryption key")).toBeNull()
    })
})
