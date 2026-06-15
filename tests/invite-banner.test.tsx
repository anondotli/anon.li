/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))
const referralLinkCopied = vi.fn()
vi.mock("@/lib/analytics", () => ({ analytics: { referralLinkCopied: (s: string) => referralLinkCopied(s) } }))

import { InviteBanner } from "@/components/referral/invite-banner"

const DISMISS_KEY = "anon-li-invite-banner-dismissed-count"
const LINK = "https://anon.li/?ref=ABCD2345"

beforeEach(() => {
    localStorage.clear()
    referralLinkCopied.mockClear()
})

afterEach(() => {
    cleanup()
    localStorage.clear()
})

describe("InviteBanner", () => {
    it("shows the invite pitch for a user with no referrals", async () => {
        render(<InviteBanner link={LINK} successfulReferrals={0} rewardDays={30} />)
        await waitFor(() => {
            expect(screen.getByText("Invite a friend, you both get Plus free")).toBeTruthy()
        })
        expect(screen.getByText(/30 days of Plus/)).toBeTruthy()
    })

    it("shows a celebratory variant once friends have joined", async () => {
        render(<InviteBanner link={LINK} successfulReferrals={2} rewardDays={30} />)
        await waitFor(() => {
            expect(screen.getByText("Nice — 2 friends have joined")).toBeTruthy()
        })
    })

    it("dismisses and persists the referral count at dismissal", async () => {
        render(<InviteBanner link={LINK} successfulReferrals={1} rewardDays={30} />)
        await waitFor(() => expect(screen.getByText(/has joined/)).toBeTruthy())

        fireEvent.click(screen.getByRole("button", { name: "Dismiss invite banner" }))

        await waitFor(() => expect(screen.queryByText(/has joined/)).toBeNull())
        expect(localStorage.getItem(DISMISS_KEY)).toBe("1")
    })

    it("stays hidden while no new friend has joined since dismissal", async () => {
        localStorage.setItem(DISMISS_KEY, "1")
        render(<InviteBanner link={LINK} successfulReferrals={1} rewardDays={30} />)
        // Give the reveal effect a tick; it should decide to stay hidden.
        await new Promise((r) => setTimeout(r, 5))
        expect(screen.queryByRole("button", { name: "Dismiss invite banner" })).toBeNull()
    })

    it("re-shows once a new friend has joined since dismissal", async () => {
        localStorage.setItem(DISMISS_KEY, "1")
        render(<InviteBanner link={LINK} successfulReferrals={2} rewardDays={30} />)
        await waitFor(() => expect(screen.getByText("Nice — 2 friends have joined")).toBeTruthy())
    })

    it("copies the link and fires the analytics event", async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })

        render(<InviteBanner link={LINK} successfulReferrals={0} rewardDays={30} />)
        await waitFor(() => expect(screen.getByRole("button", { name: "Copy referral link" })).toBeTruthy())

        fireEvent.click(screen.getByRole("button", { name: "Copy referral link" }))

        await waitFor(() => expect(writeText).toHaveBeenCalledWith(LINK))
        expect(referralLinkCopied).toHaveBeenCalledWith("dashboard_banner")
    })
})
