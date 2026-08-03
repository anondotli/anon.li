/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const { requireSession, checkRateLimit, paymentFindFirst } = vi.hoisted(() => ({
    requireSession: vi.fn(),
    checkRateLimit: vi.fn(),
    paymentFindFirst: vi.fn(),
}))

vi.mock("@/lib/api-auth", () => ({ requireSession }))
vi.mock("@/lib/rate-limit", () => ({
    checkRateLimit,
    rateLimiters: { api: {} },
}))
vi.mock("@/lib/prisma", () => ({
    prisma: { cryptoPayment: { findFirst: paymentFindFirst } },
}))

import { GET } from "@/app/api/crypto/status/route"

describe("GET /api/crypto/status", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        requireSession.mockResolvedValue({ userId: "user-1" })
        checkRateLimit.mockResolvedValue(null)
    })

    it("queries by both order and authenticated owner", async () => {
        paymentFindFirst.mockResolvedValue({ status: "waiting", product: "bundle", tier: "plus" })

        const response = await GET(new NextRequest(
            "https://anon.li/api/crypto/status?orderId=crypto_abcdefghijklmnopqrstu",
        ))

        expect(response.status).toBe(200)
        expect(response.headers.get("Cache-Control")).toBe("private, no-store")
        expect(paymentFindFirst).toHaveBeenCalledWith({
            where: { orderId: "crypto_abcdefghijklmnopqrstu", userId: "user-1" },
            select: { status: true, product: true, tier: true },
        })
        expect(checkRateLimit).toHaveBeenCalledWith({}, "crypto-status:user-1")
    })

    it("rejects malformed order IDs before querying", async () => {
        const response = await GET(new NextRequest(
            "https://anon.li/api/crypto/status?orderId=not-an-order",
        ))

        expect(response.status).toBe(400)
        expect(paymentFindFirst).not.toHaveBeenCalled()
    })

    it("does not distinguish another user's order from a missing order", async () => {
        paymentFindFirst.mockResolvedValue(null)

        const response = await GET(new NextRequest(
            "https://anon.li/api/crypto/status?orderId=crypto_abcdefghijklmnopqrstu",
        ))

        expect(response.status).toBe(404)
    })
})
