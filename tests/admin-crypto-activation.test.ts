/**
 * @vitest-environment node
 *
 * Admin "Activate held crypto payment": only needs_review payments, skips the
 * Stripe conflict check (support resolved it), and is audit-logged.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    cryptoPaymentFindUnique: vi.fn(),
    activateCryptoPayment: vi.fn(),
    audit: vi.fn(),
}))

vi.mock("resend", () => ({ Resend: class { emails = { send: vi.fn() } } }))
vi.mock("@/lib/prisma", () => ({ prisma: { cryptoPayment: { findUnique: mocks.cryptoPaymentFindUnique } } }))
vi.mock("@/lib/services/drop-storage", () => ({ deleteDropFilesAndReleaseQuota: vi.fn() }))
vi.mock("@/lib/storage", () => ({ abortMultipartUpload: vi.fn() }))
vi.mock("@/lib/services/crypto-activation", () => ({ activateCryptoPayment: mocks.activateCryptoPayment }))
vi.mock("@/lib/posthog.server", () => ({ flushPostHog: vi.fn(), trackServerEvent: vi.fn(), captureServerEvent: vi.fn() }))
vi.mock("@/lib/services/audit", () => ({ audit: mocks.audit }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/safe-action", () => ({
    runAdminAction: vi.fn(async (opts: { data?: unknown }, cb: (data: unknown, adminId: string) => unknown) => {
        try {
            return { data: await cb(opts.data, "admin_1") }
        } catch (error) {
            return { error: (error as Error).message }
        }
    }),
}))

import { AdminService } from "@/lib/services/admin"
import { activateHeldCryptoPayment } from "@/actions/admin"

const heldPayment = {
    id: "cp_1",
    userId: "user_1",
    orderId: "crypto_ord_1",
    product: "bundle",
    tier: "plus",
    planPriceId: "price_x",
    priceAmount: 6.99,
    status: "needs_review",
}

beforeEach(() => {
    vi.clearAllMocks()
    mocks.cryptoPaymentFindUnique.mockResolvedValue(heldPayment)
    mocks.activateCryptoPayment.mockResolvedValue({ kind: "activated", periodEnd: new Date("2026-11-10T00:00:00Z"), interval: "monthly" })
})

describe("AdminService.activateHeldCryptoPayment", () => {
    it("activates a held payment without the Stripe conflict check", async () => {
        await AdminService.activateHeldCryptoPayment("cp_1")

        expect(mocks.activateCryptoPayment).toHaveBeenCalledWith(heldPayment, { status: "finished" }, { ignoreConflict: true })
    })

    it("refuses payments that are not held for review", async () => {
        mocks.cryptoPaymentFindUnique.mockResolvedValue({ ...heldPayment, status: "waiting" })

        await expect(AdminService.activateHeldCryptoPayment("cp_1")).rejects.toThrow("held for review")
        expect(mocks.activateCryptoPayment).not.toHaveBeenCalled()
    })

    it("reports a payment that changed state concurrently", async () => {
        mocks.activateCryptoPayment.mockResolvedValue({ kind: "skipped" })

        await expect(AdminService.activateHeldCryptoPayment("cp_1")).rejects.toThrow("could not be activated")
    })
})

describe("activateHeldCryptoPayment admin action", () => {
    it("audit-logs the activation", async () => {
        const result = await activateHeldCryptoPayment("cp_1")

        expect(result).toEqual({ data: { success: true } })
        expect(mocks.audit).toHaveBeenCalledWith({
            action: "billing.crypto_payment.activate",
            actorId: "admin_1",
            targetId: "cp_1",
            metadata: { userId: "user_1", orderId: "crypto_ord_1", periodEnd: "2026-11-10T00:00:00.000Z" },
        })
    })
})
