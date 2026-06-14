/**
 * @vitest-environment jsdom
 *
 * The redesigned Business upgrade card shown to an org owner with no Business
 * subscription. It mirrors the marketing /pricing#teams card: per-seat price with
 * a billing-frequency toggle + savings badge, a Subscribe CTA, and the Business
 * feature checklist.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { BUSINESS_PLAN, BUSINESS_SEAT_PRICE } from "@/config/plans"

const org = {
    id: "org-1",
    name: "Acme",
    slug: "acme",
    members: [
        { id: "m1", userId: "owner-1", role: "owner", user: { name: "Owner", email: "owner@acme.com", image: "" } },
    ],
    invitations: [],
}

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
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
            getFullOrganization: vi.fn(),
            inviteMember: vi.fn(),
            removeMember: vi.fn(),
            updateMemberRole: vi.fn(),
            cancelInvitation: vi.fn(),
            update: vi.fn(),
            leave: vi.fn(),
            delete: vi.fn(),
            setActive: vi.fn(),
        },
    },
}))

import { TeamManagement } from "@/components/dashboard/team/team-management"
import { createTeamCheckoutSession } from "@/actions/create-team-checkout"

const checkoutMock = vi.mocked(createTeamCheckoutSession)

function renderCard(seatLimit = 2) {
    render(
        <TeamManagement
            currentUserId="owner-1"
            plan={null}
            seatLimit={seatLimit}
            keyRotationRecommended={false}
            enforce2FA={false}
            keyGeneration={0}
        />,
    )
}

afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())

describe("Business upgrade card", () => {
    it("renders the Business pitch, features, and a Subscribe CTA", () => {
        renderCard()
        expect(screen.getByText("Upgrade to Business")).toBeTruthy()
        expect(screen.getByRole("button", { name: /subscribe/i })).toBeTruthy()
        for (const feature of BUSINESS_PLAN.features) {
            expect(screen.getByText(feature)).toBeTruthy()
        }
    })

    it("defaults to yearly pricing with a savings badge and toggles to monthly", () => {
        renderCard()
        // Yearly is the default: monthly-equivalent of $119.89/12 ≈ $9.99.
        expect(screen.getByText("$9.99")).toBeTruthy()
        expect(screen.getByText(/Save 17%/)).toBeTruthy()
        expect(screen.getByText(/Billed \$119\.89\/seat\/year/)).toBeTruthy()

        fireEvent.click(screen.getByRole("button", { name: "Monthly" }))
        expect(screen.getByText("$11.99")).toBeTruthy()
    })

    it("defaults to 2 seats and shows the yearly total", () => {
        renderCard()
        const total = (2 * BUSINESS_SEAT_PRICE.yearly).toFixed(2)
        expect(screen.getByText(`$${total}`)).toBeTruthy()
        expect(screen.getByText(/Invite up to 2 members/)).toBeTruthy()
    })

    it("lets the owner raise the seat count and recomputes the total", () => {
        renderCard()
        fireEvent.click(screen.getByRole("button", { name: "Add a seat" }))
        const total = (3 * BUSINESS_SEAT_PRICE.yearly).toFixed(2)
        expect(screen.getByText(`$${total}`)).toBeTruthy()
        expect(screen.getByText(/Invite up to 3 members/)).toBeTruthy()
    })

    it("passes the chosen seat count to checkout", () => {
        renderCard()
        fireEvent.click(screen.getByRole("button", { name: "Add a seat" })) // 2 -> 3
        fireEvent.click(screen.getByRole("button", { name: /subscribe/i }))
        expect(checkoutMock).toHaveBeenCalledWith({ frequency: "yearly", seats: 3 })
    })

    it("disables inviting on a fresh free team (purchase-first)", () => {
        // A free team has a single seat (the owner), so the invite form is locked
        // until the owner subscribes and buys seats.
        renderCard(1)
        expect((screen.getByRole("button", { name: /invite/i }) as HTMLButtonElement).disabled).toBe(true)
        expect(screen.getByText(/buy seats below to invite teammates/i)).toBeTruthy()
    })
})
