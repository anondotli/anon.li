/**
 * Admin revenue MRR: yearly subscriptions are normalized to a monthly amount,
 * and lapsed prepaid (crypto) periods are not counted as revenue.
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest"
import { BUNDLE_PLANS, BUSINESS_PLAN, BUSINESS_SEAT_PRICE } from "@/config/plans"
import { prisma } from "@/lib/prisma"

vi.mock("@/lib/prisma", () => ({
    prisma: {
        $queryRaw: vi.fn().mockResolvedValue([]),
        subscription: { findMany: vi.fn().mockResolvedValue([]) },
    },
}))

const findMany = (prisma as unknown as { subscription: { findMany: Mock } }).subscription.findMany

describe("getAdminRevenueSeries MRR", () => {
    beforeEach(() => {
        vi.clearAllMocks()
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
