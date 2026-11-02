/**
 * @vitest-environment jsdom
 */
import { act } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))

const session = vi.hoisted(() => ({ current: { data: null as unknown, isPending: false } }))
vi.mock("@/lib/auth-client", () => ({ authClient: { useSession: () => session.current } }))

const pathname = vi.hoisted(() => ({ current: "/" }))
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }))

import { getActivePromotion, type Promotion } from "@/config/promotions"
import { MarketingPromoBar } from "@/components/promotions/marketing-promo-bar"
import { PromoBar } from "@/components/promotions/promo-bar"

const DURING = new Date("2026-11-27T12:00:00Z")
const AFTER = new Date("2026-12-06T23:59:00Z")
const DISMISS_KEY = "anon-li-promo-dismissed:black-friday-2026"
const PROMO = getActivePromotion(DURING.getTime()) as Promotion

/** Let the mount effect (a 0ms timer) run before asserting the bar is absent. */
async function settle() {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
    })
}

const bar = () => screen.queryByRole("region", { name: "Black Friday offer" })

beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(DURING)
    session.current = { data: null, isPending: false }
    pathname.current = "/"
})

afterEach(() => {
    cleanup()
    vi.useRealTimers()
    localStorage.clear()
})

describe("PromoBar", () => {
    it("shows the offer, code and end date", async () => {
        render(<PromoBar promotion={PROMO} />)
        await waitFor(() => expect(bar()).toBeTruthy())
        expect(bar()!.textContent).toContain("40% off all plans for 12 months")
        expect(bar()!.textContent).toContain("Ends Dec 6")
        expect(screen.getByRole("button", { name: "Copy promo code BLKFRI40" })).toBeTruthy()
    })

    it("copies the code", async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
        render(<PromoBar promotion={PROMO} />)
        fireEvent.click(await screen.findByRole("button", { name: "Copy promo code BLKFRI40" }))
        await waitFor(() => expect(writeText).toHaveBeenCalledWith("BLKFRI40"))
    })

    it("stays dismissed in this browser", async () => {
        const { unmount } = render(<PromoBar promotion={PROMO} />)
        fireEvent.click(await screen.findByRole("button", { name: "Dismiss Black Friday offer" }))
        expect(bar()).toBeNull()
        expect(localStorage.getItem(DISMISS_KEY)).not.toBeNull()

        unmount()
        render(<PromoBar promotion={PROMO} />)
        await settle()
        expect(bar()).toBeNull()
    })
})

describe("MarketingPromoBar", () => {
    it("shows the offer to signed-out visitors during the promotion", async () => {
        render(<MarketingPromoBar />)
        await waitFor(() => expect(bar()).toBeTruthy())
    })

    it("stays hidden for signed-in viewers, who may be paying customers", async () => {
        session.current = { data: { user: { id: "user-1" } }, isPending: false }
        render(<MarketingPromoBar />)
        await settle()
        expect(bar()).toBeNull()
    })

    it("stays hidden while the session is still loading", async () => {
        session.current = { data: null, isPending: true }
        render(<MarketingPromoBar />)
        await settle()
        expect(bar()).toBeNull()
    })

    it("defers to the pricing page's own banner", async () => {
        pathname.current = "/pricing"
        render(<MarketingPromoBar />)
        await settle()
        expect(bar()).toBeNull()
    })

    it("disappears once the promotion ends", async () => {
        vi.setSystemTime(AFTER)
        render(<MarketingPromoBar />)
        await settle()
        expect(bar()).toBeNull()
    })
})
