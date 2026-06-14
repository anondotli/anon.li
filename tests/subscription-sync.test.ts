/**
 * @vitest-environment node
 *
 * mapStripeStatus is the single point that translates Stripe's subscription
 * lifecycle into our access-granting status. A wrong mapping silently grants or
 * revokes paid access, so the full table is pinned here.
 */
import { describe, it, expect, vi } from "vitest"
import type Stripe from "stripe"

// Module-level imports pull in the Stripe client + prisma; stub them so importing
// the unit under test doesn't require live credentials.
vi.mock("@/lib/stripe", () => ({ stripe: {} }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/services/audit", () => ({ audit: vi.fn() }))

import { mapStripeStatus } from "@/lib/services/subscription-sync"

describe("mapStripeStatus", () => {
    const cases: Array<[Stripe.Subscription.Status, string]> = [
        ["active", "active"],
        ["trialing", "trialing"],
        ["canceled", "canceled"],
        ["incomplete_expired", "canceled"],
        ["past_due", "past_due"],
        ["unpaid", "past_due"],
        ["incomplete", "past_due"],
        ["paused", "past_due"],
    ]

    it.each(cases)("maps Stripe %s -> %s", (input, expected) => {
        expect(mapStripeStatus(input)).toBe(expected)
    })

    it("falls back to canceled for unrecognized statuses", () => {
        expect(mapStripeStatus("some_future_status" as Stripe.Subscription.Status)).toBe("canceled")
    })
})
