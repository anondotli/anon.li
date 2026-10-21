/**
 * Admin revenue MRR: yearly subscriptions are normalized to a monthly amount,
 * lapsed prepaid (crypto) periods are not counted as revenue, and USD list
 * prices are reported in EUR when a reference rate is available.
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest"
import { BUNDLE_PLANS, BUSINESS_PLAN, BUSINESS_SEAT_PRICE } from "@/config/plans"
import { getUsdToEurRate } from "@/lib/fx"
import { prisma } from "@/lib/prisma"

vi.mock("@/lib/fx", () => ({ getUsdToEurRate: vi.fn().mockResolvedValue(null) }))

vi.mock("@/lib/prisma", () => ({
    prisma: {
        $queryRaw: vi.fn().mockResolvedValue([]),
        subscription: { findMany: vi.fn().mockResolvedValue([]) },
    },
}))

const findMany = (prisma as unknown as { subscription: { findMany: Mock } }).subscription.findMany
const usdToEur = getUsdToEurRate as Mock

describe("getAdminRevenueSeries MRR", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        usdToEur.mockResolvedValue(null)
    })

    it("normalizes yearly subscriptions to a monthly amount", async () => {
        const yearlyBundle = BUNDLE_PLANS.plus.priceIds!.yearly
        const businessYearly = BUSINESS_PLAN.priceIds?.yearly ?? "price_business_yearly_unset"
        findMany.mockResolvedValue([
            { provider: "stripe", product: "bundle", tier: "plus", seats: 1, providerPriceId: yearlyBundle },
            { provider: "crypto", product: "bundle", tier: "plus", seats: 1, providerPriceId: BUNDLE_PLANS.plus.priceIds!.monthly },
            { provider: "stripe", product: "business", tier: "pro", seats: 3, providerPriceId: businessYearly },
        ])

        const { getAdminRevenueSeries } = await import("@/lib/data/admin")
        const result = await getAdminRevenueSeries(30)

        const businessPerSeat = BUSINESS_PLAN.priceIds?.yearly
            ? BUSINESS_SEAT_PRICE.yearly / 12
            : BUSINESS_SEAT_PRICE.monthly
        const expected = BUNDLE_PLANS.plus.price.yearly / 12
            + BUNDLE_PLANS.plus.price.monthly
            + businessPerSeat * 3
        expect(result.currentMrr).toBeCloseTo(Math.round(expected * 100) / 100, 2)
    })

    it("converts USD list prices to EUR at the reference rate", async () => {
        usdToEur.mockResolvedValue(0.5)
        findMany.mockResolvedValue([
            { provider: "stripe", product: "bundle", tier: "plus", seats: 1, providerPriceId: BUNDLE_PLANS.plus.priceIds!.monthly },
            { provider: "stripe", product: "bundle", tier: "pro", seats: 1, providerPriceId: BUNDLE_PLANS.pro.priceIds!.monthly },
        ])

        const { getAdminRevenueSeries } = await import("@/lib/data/admin")
        const result = await getAdminRevenueSeries(30)

        const usd = BUNDLE_PLANS.plus.price.monthly + BUNDLE_PLANS.pro.price.monthly
        expect(result.currency).toBe("EUR")
        expect(result.usdToEurRate).toBe(0.5)
        expect(result.currentMrr).toBeCloseTo(Math.round(usd * 0.5 * 100) / 100, 2)
        expect(result.mrrByProduct).toEqual([
            { product: "bundle", mrr: Math.round(usd * 0.5 * 100) / 100 },
        ])
    })

    it("falls back to USD when no reference rate is available", async () => {
        findMany.mockResolvedValue([
            { provider: "stripe", product: "bundle", tier: "plus", seats: 1, providerPriceId: BUNDLE_PLANS.plus.priceIds!.monthly },
        ])

        const { getAdminRevenueSeries } = await import("@/lib/data/admin")
        const result = await getAdminRevenueSeries(30)

        expect(result.currency).toBe("USD")
        expect(result.usdToEurRate).toBeNull()
        expect(result.currentMrr).toBe(BUNDLE_PLANS.plus.price.monthly)
    })

    it("only counts subscriptions whose paid period has not lapsed", async () => {
        const { getAdminRevenueSeries } = await import("@/lib/data/admin")
        await getAdminRevenueSeries(30)

        expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                status: { in: ["active", "trialing"] },
                OR: [
                    { currentPeriodEnd: null },
                    { currentPeriodEnd: { gt: expect.any(Date) } },
                ],
            }),
        }))
    })
})
