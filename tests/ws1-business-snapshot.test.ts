/**
 * @vitest-environment node
 *
 * WS1 instrumentation: the daily business_snapshot event — book MRR in USD
 * (plan list prices, yearly normalized to monthly, business per-seat) plus
 * alias-active users, the DB facts behind the CEO dashboard.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const postHog = vi.hoisted(() => ({
    capture: vi.fn(),
    captureException: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
}))
const subscriptionFindMany = vi.hoisted(() => vi.fn())
const aliasGroupBy = vi.hoisted(() => vi.fn())
const userCount = vi.hoisted(() => vi.fn())

vi.mock("posthog-node", () => ({
    PostHog: class MockPostHog {
        capture = postHog.capture
        captureException = postHog.captureException
        flush = postHog.flush
    },
}))
vi.mock("@/lib/prisma", () => ({
    prisma: {
        subscription: { findMany: subscriptionFindMany },
        alias: { groupBy: aliasGroupBy },
        user: { count: userCount },
    },
}))

import { handleBusinessSnapshotCron } from "@/lib/services/cron-business-snapshot"

describe("business_snapshot cron", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test"
        userCount.mockResolvedValue(594)
        aliasGroupBy.mockResolvedValue([{ userId: "u1" }, { userId: "u2" }])
    })

    it("computes book MRR across monthly, yearly and per-seat subscriptions", async () => {
        subscriptionFindMany.mockResolvedValue([
            // monthly list price as-is
            { product: "bundle", tier: "plus", seats: 1, providerPriceId: process.env.STRIPE_BUNDLE_PLUS_MONTHLY_PRICE_ID },
            // yearly normalized to monthly: 89.89 / 12
            { product: "bundle", tier: "pro", seats: 1, providerPriceId: process.env.STRIPE_BUNDLE_PRO_YEARLY_PRICE_ID },
            // business per-seat: 11.99 * 3 (yearly business id differs, so monthly branch)
            { product: "business", tier: "pro", seats: 3, providerPriceId: "price_business_monthly_test" },
        ])

        const result = await handleBusinessSnapshotCron()

        const expected = Math.round((6.99 + 89.89 / 12 + 11.99 * 3) * 100) / 100
        expect(result).toMatchObject({
            emitted: true,
            mrrUsd: expected,
            aliasActiveUsers30d: 2,
            activeSubscriptions: 3,
            totalRegisteredUsers: 594,
        })

        expect(postHog.capture).toHaveBeenCalledWith(expect.objectContaining({
            distinctId: "business_metrics",
            event: "business_snapshot",
            properties: expect.objectContaining({
                mrr_usd: expected,
                alias_active_users_30d: 2,
                active_subscriptions: 3,
                total_registered_users: 594,
            }),
        }))
        expect(postHog.flush).toHaveBeenCalled()
    })

    it("falls back to the monthly list price for unrecognized price ids", async () => {
        subscriptionFindMany.mockResolvedValue([
            // legacy price id not in config → monthly list price (9.99)
            { product: "bundle", tier: "pro", seats: 1, providerPriceId: "price_legacy_2025" },
            // unknown product → contributes nothing
            { product: "mystery", tier: "plus", seats: 1, providerPriceId: null },
        ])
        aliasGroupBy.mockResolvedValue([])

        const result = await handleBusinessSnapshotCron()

        expect(result.mrrUsd).toBe(9.99)
        expect(result.aliasActiveUsers30d).toBe(0)
    })
})
