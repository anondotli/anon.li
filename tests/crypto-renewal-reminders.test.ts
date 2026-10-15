/**
 * Crypto renewal reminders are deduped per paid period, so each period (e.g.
 * every month of a monthly plan) gets its own 14-day and 3-day reminders.
 * Also pins the recoverable-invoice ordering used by the recovery cron.
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    redisGet: vi.fn(),
    redisSet: vi.fn(),
    getCryptoRenewalReminderUsers: vi.fn(),
    sendCryptoRenewalReminderEmail: vi.fn(),
    cryptoPaymentFindMany: vi.fn(),
}))

vi.mock("@upstash/redis", () => ({
    Redis: class {
        get = mocks.redisGet
        set = mocks.redisSet
    },
}))
vi.mock("@/lib/data/user", () => ({ getCryptoRenewalReminderUsers: mocks.getCryptoRenewalReminderUsers }))
vi.mock("@/lib/resend", () => ({ sendCryptoRenewalReminderEmail: mocks.sendCryptoRenewalReminderEmail }))
vi.mock("@/lib/prisma", () => ({ prisma: { cryptoPayment: { findMany: mocks.cryptoPaymentFindMany } } }))
vi.mock("@/lib/services/billing-downgrade", () => ({
    BillingDowngradeService: {
        processReferralPlusLapses: vi.fn().mockResolvedValue({ recorded: 0, skipped: 0, errors: 0 }),
        processSchedulingBatch: vi.fn().mockResolvedValue({ processed: 0, errors: 0 }),
        processDeletionBatch: vi.fn().mockResolvedValue({ processed: 0, errors: 0 }),
    },
}))
vi.mock("@/lib/services/subscription-sync", () => ({
    reconcileStaleStripeSubscriptions: vi.fn().mockResolvedValue({ checked: 0, revoked: 0, refreshed: 0, errors: 0 }),
}))
vi.mock("@/lib/services/crypto-activation", () => ({
    recheckHeldCryptoPayments: vi.fn().mockResolvedValue({ checked: 0, activated: 0, errors: 0 }),
}))
vi.mock("@/lib/services/crypto-subscription", () => ({
    expireLapsedCryptoSubscriptions: vi.fn().mockResolvedValue({ expired: 0, downgraded: 0, errors: 0 }),
}))

import { handleBillingCron } from "@/lib/services/cron-billing"
import { getRecoverableCryptoInvoices } from "@/lib/data/crypto-payment"

const DAY = 86_400_000

describe("crypto renewal reminders", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.redisGet.mockResolvedValue(null)
        mocks.redisSet.mockResolvedValue("OK")
        mocks.sendCryptoRenewalReminderEmail.mockResolvedValue({ success: true })
    })

    it("scopes the dedupe key and idempotency key to the paid period", async () => {
        const periodEnd = new Date(Date.now() + 10 * DAY)
        mocks.getCryptoRenewalReminderUsers.mockResolvedValue([
            { id: "user_1", email: "u@example.com", product: "bundle", tier: "plus", currentPeriodEnd: periodEnd },
        ])

        await handleBillingCron()

        const periodKey = periodEnd.toISOString().slice(0, 10)
        expect(mocks.redisGet).toHaveBeenCalledWith(`crypto:renewal:14d:user_1:${periodKey}`)
        expect(mocks.redisSet).toHaveBeenCalledWith(`crypto:renewal:14d:user_1:${periodKey}`, "1", { ex: 86400 * 30 })
        expect(mocks.sendCryptoRenewalReminderEmail).toHaveBeenCalledWith(
            "u@example.com",
            expect.objectContaining({ daysRemaining: 10 }),
            `crypto-renewal-14d/user_1/${periodKey}`,
        )
    })

    it("sends the reminder for a new period even though the previous period's was sent", async () => {
        const previousPeriodKey = new Date(Date.now() - 20 * DAY).toISOString().slice(0, 10)
        const periodEnd = new Date(Date.now() + 2 * DAY)
        mocks.getCryptoRenewalReminderUsers.mockResolvedValue([
            { id: "user_1", email: "u@example.com", product: "bundle", tier: "plus", currentPeriodEnd: periodEnd },
        ])
        mocks.redisGet.mockImplementation(async (key: string) =>
            key.endsWith(previousPeriodKey) ? "1" : null,
        )

        const result = await handleBillingCron()

        expect(mocks.redisGet).toHaveBeenCalledWith(`crypto:renewal:3d:user_1:${periodEnd.toISOString().slice(0, 10)}`)
        expect(result.cryptoReminders).toEqual({ sent: 1, errors: 0 })
    })

    it("does not resend within the same period", async () => {
        mocks.getCryptoRenewalReminderUsers.mockResolvedValue([
            { id: "user_1", email: "u@example.com", product: "bundle", tier: "plus", currentPeriodEnd: new Date(Date.now() + 2 * DAY) },
        ])
        mocks.redisGet.mockResolvedValue("1")

        await handleBillingCron()

        expect(mocks.sendCryptoRenewalReminderEmail).not.toHaveBeenCalled()
    })
})

describe("getRecoverableCryptoInvoices", () => {
    const row = (id: string, status = "waiting") => ({ id, status, createdAt: new Date(), user: { email: "u@example.com" } })

    it("fills the batch with the oldest waiting invoices first, then the newest invoices", async () => {
        mocks.cryptoPaymentFindMany.mockReset()
        mocks.cryptoPaymentFindMany
            .mockResolvedValueOnce([row("old_1"), row("old_2")]) // oldest waiting
            .mockResolvedValueOnce([row("new_1", "expired"), row("old_2"), row("new_2")]) // newest

        const result = await getRecoverableCryptoInvoices({ createdBefore: new Date(), createdAfter: new Date(0), limit: 4 })

        expect(mocks.cryptoPaymentFindMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
            where: expect.objectContaining({ status: "waiting" }),
            orderBy: { createdAt: "asc" },
            take: 2,
        }))
        expect(mocks.cryptoPaymentFindMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
            where: expect.objectContaining({ status: { in: ["waiting", "expired"] } }),
            orderBy: { createdAt: "desc" },
            take: 4,
        }))
        // Deduplicated and capped at the limit.
        expect(result.map((r) => r.id)).toEqual(["old_1", "old_2", "new_1", "new_2"])
    })

    it("does not bound expiry candidates by the notification floor", async () => {
        mocks.cryptoPaymentFindMany.mockReset()
        mocks.cryptoPaymentFindMany.mockResolvedValue([])
        const createdBefore = new Date()
        const createdAfter = new Date(Date.now() - 30 * DAY)

        await getRecoverableCryptoInvoices({ createdBefore, createdAfter, limit: 4 })

        // Oldest waiting: any age, so invoices stranded past 30 days still expire.
        expect(mocks.cryptoPaymentFindMany.mock.calls[0]![0].where).toEqual({
            status: "waiting",
            createdAt: { lt: createdBefore },
        })
        // Newest (notification) half keeps the floor.
        expect(mocks.cryptoPaymentFindMany.mock.calls[1]![0].where.createdAt).toEqual({
            gte: createdAfter,
            lt: createdBefore,
        })
    })
})

describe("billing cron referral Plus lapses", () => {
    it("starts the downgrade flow for lapsed referral Plus before scheduling", async () => {
        const { BillingDowngradeService } = await import("@/lib/services/billing-downgrade")
        const order: string[] = []
        vi.mocked(BillingDowngradeService.processReferralPlusLapses).mockImplementationOnce(async () => {
            order.push("lapses")
            return { recorded: 2, skipped: 0, errors: 0 }
        })
        vi.mocked(BillingDowngradeService.processSchedulingBatch).mockImplementationOnce(async () => {
            order.push("scheduling")
            return { processed: 0, errors: 0 }
        })
        mocks.getCryptoRenewalReminderUsers.mockResolvedValue([])

        const result = await handleBillingCron()

        expect(order).toEqual(["lapses", "scheduling"])
        expect(result.referralPlusLapses).toEqual({ recorded: 2, skipped: 0, errors: 0 })
    })
})
