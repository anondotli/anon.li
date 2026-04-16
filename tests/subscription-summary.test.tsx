/**
 * @vitest-environment jsdom
 */
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

vi.mock("next/link", () => ({
    default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}))

vi.mock("@/app/(dashboard)/dashboard/billing/manage-button", () => ({
    ManageSubscriptionButton: ({ label }: { label?: string }) => (
        <button type="button">{label ?? "Manage Subscription"}</button>
    ),
}))

vi.mock("@/components/billing", () => ({
    PaymentMethodDialog: () => null,
}))

afterEach(() => {
    cleanup()
})

describe("SubscriptionSummary", () => {
    it("shows an upgrade link for free users in the billing action slot", async () => {
        const { SubscriptionSummary } = await import("@/app/(dashboard)/dashboard/billing/subscription-summary")

        render(<SubscriptionSummary planId="free" product="drop" />)

        const upgradeLink = screen.getByRole("link", { name: "Upgrade Plan" })
        expect(upgradeLink.getAttribute("href")).toBe("/pricing?drop")
        expect(screen.queryByRole("button", { name: "Manage Subscription" })).toBeNull()
    })

    it("shows manage subscription for paid card subscriptions", async () => {
        const { SubscriptionSummary } = await import("@/app/(dashboard)/dashboard/billing/subscription-summary")

        render(<SubscriptionSummary planId="plus" paymentMethod="card" />)

        expect(screen.getByRole("button", { name: "Manage Subscription" })).toBeTruthy()
        expect(screen.queryByRole("link", { name: "Upgrade Plan" })).toBeNull()
    })

    it("shows renew subscription for paid crypto subscriptions", async () => {
        const { SubscriptionSummary } = await import("@/app/(dashboard)/dashboard/billing/subscription-summary")

        render(<SubscriptionSummary planId="pro" paymentMethod="crypto" />)

        expect(screen.getByRole("button", { name: "Renew Subscription" })).toBeTruthy()
        expect(screen.queryByRole("link", { name: "Upgrade Plan" })).toBeNull()
    })
})
