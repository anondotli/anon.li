/**
 * @vitest-environment node
 *
 * Billing loss / recovery paths outside the Stripe webhook: crypto period
 * math and expiry, and the org-scoped drop grace + its undo on recovery.
 */
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest"
import { Prisma } from "@prisma/client"

vi.mock("server-only", () => ({}))

const mocks = vi.hoisted(() => ({
    subscriptionFindMany: vi.fn(),
    subscriptionUpdateMany: vi.fn(),
    dropUpdateMany: vi.fn(),
    organizationUpdateMany: vi.fn(),
    organizationFindUnique: vi.fn(),
    executeRaw: vi.fn(),
    hasActivePersonalSubscription: vi.fn(),
    handlePersonalSubscriptionLoss: vi.fn(),
    getOrgAdminEmails: vi.fn(),
    sendSubscriptionCanceledEmail: vi.fn(),
    audit: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
    prisma: {
        subscription: { findMany: mocks.subscriptionFindMany, updateMany: mocks.subscriptionUpdateMany },
        drop: { updateMany: mocks.dropUpdateMany },
        organization: { updateMany: mocks.organizationUpdateMany, findUnique: mocks.organizationFindUnique },
        $executeRaw: mocks.executeRaw,
    },
}))
vi.mock("@/lib/services/billing-downgrade", () => ({
    BillingDowngradeService: {
        hasActivePersonalSubscription: mocks.hasActivePersonalSubscription,
        handlePersonalSubscriptionLoss: mocks.handlePersonalSubscriptionLoss,
    },
}))
vi.mock("@/lib/data/organization", () => ({ getOrgAdminEmails: mocks.getOrgAdminEmails }))
vi.mock("@/lib/resend", () => ({ sendSubscriptionCanceledEmail: mocks.sendSubscriptionCanceledEmail }))
vi.mock("@/lib/services/audit", () => ({ audit: mocks.audit }))

import {
    addMonthsClamped,
    expireLapsedCryptoSubscriptions,
    getCryptoPeriodEnd,
} from "@/lib/services/crypto-subscription"
import { handleOrgSubscriptionLoss, restoreOrgDropGrace } from "@/lib/services/org-billing"

const iso = (d: Date) => d.toISOString().slice(0, 10)

describe("crypto period math", () => {
    it("clamps a month-end start to the last day of the next month", () => {
        expect(iso(addMonthsClamped(new Date("2026-01-31T12:00:00Z"), 1))).toBe("2026-02-28")
        expect(iso(addMonthsClamped(new Date("2028-01-31T12:00:00Z"), 1))).toBe("2028-02-29")
        expect(iso(addMonthsClamped(new Date("2026-03-31T12:00:00Z"), 1))).toBe("2026-04-30")
        expect(iso(addMonthsClamped(new Date("2026-12-31T12:00:00Z"), 1))).toBe("2027-01-31")
    })

    it("keeps the time of day and a mid-month day unchanged", () => {
        const end = addMonthsClamped(new Date("2026-05-15T08:30:00Z"), 1)
        expect(end.toISOString()).toBe("2026-06-15T08:30:00.000Z")
    })

    it("computes monthly and yearly crypto periods (Feb 29 → Feb 28)", () => {
        expect(iso(getCryptoPeriodEnd(new Date("2026-01-31T00:00:00Z"), "monthly"))).toBe("2026-02-28")
        expect(iso(getCryptoPeriodEnd(new Date("2028-02-29T00:00:00Z"), "yearly"))).toBe("2029-02-28")
        expect(iso(getCryptoPeriodEnd(new Date("2026-06-10T00:00:00Z"), "yearly"))).toBe("2027-06-10")
    })
})

describe("expireLapsedCryptoSubscriptions", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.subscriptionUpdateMany.mockResolvedValue({ count: 1 })
        mocks.hasActivePersonalSubscription.mockResolvedValue(false)
        mocks.handlePersonalSubscriptionLoss.mockResolvedValue(new Date())
    })

    it("expires lapsed crypto rows and applies the personal loss", async () => {
        mocks.subscriptionFindMany.mockResolvedValue([
            { id: "sub_1", userId: "user_1", organizationId: null, user: { email: "one@example.com" } },
        ])

        const result = await expireLapsedCryptoSubscriptions()

        expect(mocks.subscriptionFindMany).toHaveBeenCalledWith(expect.objectContaining({
            where: {
                provider: "crypto",
                status: "active",
                currentPeriodEnd: { lt: expect.any(Date) },
            },
        }))
        // Only rows past the one-day access grace are selected.
        const cutoff = (mocks.subscriptionFindMany.mock.calls[0]![0] as { where: { currentPeriodEnd: { lt: Date } } })
            .where.currentPeriodEnd.lt
        expect(Date.now() - cutoff.getTime()).toBeGreaterThanOrEqual(86_400_000 - 1000)

        expect(mocks.subscriptionUpdateMany).toHaveBeenCalledWith({
            where: { id: "sub_1", status: "active" },
            data: { status: "expired", cancelAtPeriodEnd: false },
        })
        expect(mocks.handlePersonalSubscriptionLoss).toHaveBeenCalledWith("user_1", "one@example.com", { notify: true })
        expect(result).toEqual({ expired: 1, downgraded: 1, errors: 0 })
    })

    it("does not re-apply the loss when another run already expired the row", async () => {
        mocks.subscriptionFindMany.mockResolvedValue([
            { id: "sub_1", userId: "user_1", organizationId: null, user: { email: "one@example.com" } },
        ])
        mocks.subscriptionUpdateMany.mockResolvedValue({ count: 0 })

        const result = await expireLapsedCryptoSubscriptions()

        expect(mocks.handlePersonalSubscriptionLoss).not.toHaveBeenCalled()
        expect(result).toEqual({ expired: 0, downgraded: 0, errors: 0 })
    })

    it("expires the row but keeps entitlements when another personal subscription is active", async () => {
        mocks.subscriptionFindMany.mockResolvedValue([
            { id: "sub_1", userId: "user_1", organizationId: null, user: { email: "one@example.com" } },
        ])
        mocks.hasActivePersonalSubscription.mockResolvedValue(true)

        const result = await expireLapsedCryptoSubscriptions()

        expect(mocks.subscriptionUpdateMany).toHaveBeenCalled()
        expect(mocks.handlePersonalSubscriptionLoss).not.toHaveBeenCalled()
        expect(result).toEqual({ expired: 1, downgraded: 0, errors: 0 })
    })

    it("counts a per-row failure without aborting the batch", async () => {
        mocks.subscriptionFindMany.mockResolvedValue([
            { id: "sub_bad", userId: "user_1", organizationId: null, user: null },
            { id: "sub_ok", userId: "user_2", organizationId: null, user: { email: "two@example.com" } },
        ])
        mocks.subscriptionUpdateMany
            .mockRejectedValueOnce(new Error("db down"))
            .mockResolvedValueOnce({ count: 1 })

        const result = await expireLapsedCryptoSubscriptions()

        expect(result).toEqual({ expired: 1, downgraded: 1, errors: 1 })
        expect(mocks.handlePersonalSubscriptionLoss).toHaveBeenCalledWith("user_2", "two@example.com", { notify: true })
    })
})

describe("org subscription loss and recovery", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.dropUpdateMany.mockResolvedValue({ count: 1 })
        mocks.organizationUpdateMany.mockResolvedValue({ count: 1 })
        mocks.getOrgAdminEmails.mockResolvedValue(["owner@example.com", "admin@example.com"])
        mocks.sendSubscriptionCanceledEmail.mockResolvedValue({ success: true })
    })

    it("stamps unlimited standalone org drops with a tracked grace expiry and notifies admins", async () => {
        const expiry = new Date("2026-10-13T00:00:00Z")

        await handleOrgSubscriptionLoss("org_1", expiry, { notify: true })

        expect(mocks.dropUpdateMany).toHaveBeenCalledWith({
            where: {
                organizationId: "org_1",
                expiresAt: null,
                deletedAt: null,
                formSubmission: null,
                formStagingId: null,
                uploadTokens: { none: { formId: { not: null } } },
            },
            data: { expiresAt: expiry, billingGraceExpiresAt: expiry },
        })
        expect(mocks.sendSubscriptionCanceledEmail).toHaveBeenCalledTimes(2)
        expect(mocks.audit).toHaveBeenCalledTimes(1)
    })

    it("still applies the grace but skips emails on a repeated loss signal", async () => {
        await handleOrgSubscriptionLoss("org_1", new Date(), { notify: false })

        expect(mocks.dropUpdateMany).toHaveBeenCalled()
        expect(mocks.getOrgAdminEmails).not.toHaveBeenCalled()
        expect(mocks.sendSubscriptionCanceledEmail).not.toHaveBeenCalled()
        expect(mocks.audit).not.toHaveBeenCalled()
    })

    it("restores only grace-stamped drops, within the org's current plan", async () => {
        ;(mocks.executeRaw as Mock).mockResolvedValue(4)
        mocks.organizationFindUnique.mockResolvedValue({
            storageUsed: BigInt(0),
            subscriptions: [{ status: "active", product: "business", tier: "pro", currentPeriodEnd: null }],
        })

        await expect(restoreOrgDropGrace("org_1")).resolves.toBe(4)

        const [strings, ...values] = mocks.executeRaw.mock.calls[0]!
        const sql = Prisma.sql(strings as string[], ...(values as unknown[]))
        expect(sql.sql).toContain('WHEN "expiresAt" = "billing_grace_expires_at" THEN GREATEST("expiresAt",')
        expect(sql.sql).toContain('"billing_grace_expires_at" = NULL')
        expect(sql.sql).toContain('"expiryNotifiedAt" = CASE')
        expect(sql.sql).toContain('"form_staging_id" IS NULL')
        expect(sql.values[0]).toBeInstanceOf(Date)
        // Business = Pro drop limits: up to the 30-day maximum expiry.
        const days = ((sql.values[0] as Date).getTime() - Date.now()) / 86_400_000
        expect(days).toBeGreaterThan(29.9)
        expect(sql.values).toContain("org_1")
    })
})
