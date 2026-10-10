/**
 * @vitest-environment jsdom
 *
 * Expired invitations stay "pending" in better-auth until canceled. The team
 * page must label them Expired and offer a Resend that issues a fresh invite
 * (inviteMember resend:true) and retires the expired row.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

const mocks = vi.hoisted(() => ({
    inviteMember: vi.fn(),
    cancelInvitation: vi.fn(),
    getFullOrganization: vi.fn(),
    toast: { success: vi.fn(), error: vi.fn() },
}))

const hour = 60 * 60 * 1000
const org = {
    id: "org-1",
    name: "Acme",
    slug: "acme",
    members: [
        { id: "m1", userId: "owner-1", role: "owner", user: { name: "Owner", email: "owner@acme.com", image: "" } },
    ],
    invitations: [
        { id: "inv-live", email: "live@acme.com", role: "member", status: "pending", expiresAt: new Date(Date.now() + 24 * hour) },
        { id: "inv-old", email: "old@acme.com", role: "admin", status: "pending", expiresAt: new Date(Date.now() - hour) },
    ],
}

vi.mock("sonner", () => ({ toast: mocks.toast }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock("@/actions/org-settings", () => ({ setOrgEnforce2FA: vi.fn() }))
vi.mock("@/actions/create-team-checkout", () => ({ createTeamCheckoutSession: vi.fn() }))
vi.mock("@/actions/manage-org-billing", () => ({ createOrgPortalSession: vi.fn(), updateOrgSeats: vi.fn() }))
vi.mock("@/components/vault/vault-provider", () => ({ useOptionalVault: () => null }))
vi.mock("@/lib/vault/org-vault-client", () => ({ bootstrapOrgVault: vi.fn(), rotateOrgVaultKey: vi.fn() }))
vi.mock("@/lib/auth-client", () => ({
    authClient: {
        useActiveOrganization: () => ({ data: org, isPending: false }),
        organization: {
            getFullOrganization: mocks.getFullOrganization,
            inviteMember: mocks.inviteMember,
            removeMember: vi.fn(),
            updateMemberRole: vi.fn(),
            cancelInvitation: mocks.cancelInvitation,
            update: vi.fn(),
            leave: vi.fn(),
            delete: vi.fn(),
            setActive: vi.fn(),
        },
    },
}))

import { TeamManagement } from "@/components/dashboard/team/team-management"

function renderTeam() {
    render(
        <TeamManagement
            currentUserId="owner-1"
            plan={{ seats: 5, status: "active", currentPeriodEnd: new Date(Date.now() + 720 * hour), cancelAtPeriodEnd: false }}
            seatLimit={5}
            keyRotationRecommended={false}
            enforce2FA={false}
            keyGeneration={1}
        />,
    )
}

afterEach(cleanup)
beforeEach(() => {
    vi.clearAllMocks()
    mocks.inviteMember.mockResolvedValue({ data: {}, error: null })
    mocks.cancelInvitation.mockResolvedValue({ data: {}, error: null })
    mocks.getFullOrganization.mockResolvedValue({ data: null })
})

describe("team invitation expiry", () => {
    it("labels expired invitations and only offers Resend for them", () => {
        renderTeam()
        expect(screen.getAllByText("Expired")).toHaveLength(1)
        expect(screen.getAllByRole("button", { name: "Resend" })).toHaveLength(1)
    })

    it("re-invites with resend:true and cancels the expired row", async () => {
        renderTeam()
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Resend" }))
        })

        expect(mocks.inviteMember).toHaveBeenCalledWith({ email: "old@acme.com", role: "admin", resend: true })
        expect(mocks.cancelInvitation).toHaveBeenCalledWith({ invitationId: "inv-old" })
        expect(mocks.toast.success).toHaveBeenCalledWith("Invitation re-sent to old@acme.com")
    })

    it("keeps the expired row and reports the error when re-inviting fails", async () => {
        mocks.inviteMember.mockResolvedValueOnce({ data: null, error: { message: "No seats available" } })
        renderTeam()
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Resend" }))
        })

        expect(mocks.cancelInvitation).not.toHaveBeenCalled()
        expect(mocks.toast.error).toHaveBeenCalledWith("No seats available")
    })
})
