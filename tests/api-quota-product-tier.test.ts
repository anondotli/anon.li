/**
 * @vitest-environment node
 *
 * The monthly API quota tier is resolved for the product the route/tool
 * belongs to — not the highest tier the user holds on any product.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const limiters = vi.hoisted(() => {
    const make = (name: string) => ({
        name,
        limit: vi.fn(async () => ({ success: true, limit: 1, remaining: 1, reset: Date.now() })),
        getRemaining: vi.fn(async () => ({ limit: 1, remaining: 1, reset: Date.now() })),
    })
    return {
        free: make("free"), plus: make("plus"), pro: make("pro"),
        dropFree: make("dropFree"), dropPlus: make("dropPlus"), dropPro: make("dropPro"),
        formFree: make("formFree"), formPlus: make("formPlus"), formPro: make("formPro"),
    }
})

vi.mock("@/lib/rate-limit", () => ({ monthlyApiLimiters: limiters }))

import { checkApiQuota, readApiQuota } from "@/lib/api-rate-limit"

const future = new Date(Date.now() + 20 * 86_400_000)
const dropProUser = {
    subscriptions: [{ status: "active", product: "drop", tier: "pro", currentPeriodEnd: future }],
    referralPlusUntil: null,
}

function usedLimiter(): string | undefined {
    return Object.values(limiters).find((l) => l.limit.mock.calls.length > 0 || l.getRemaining.mock.calls.length > 0)?.name
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("per-product API quota tier", () => {
    it("charges a Drop-only Pro user's alias calls to the FREE alias bucket", async () => {
        await checkApiQuota("u1", dropProUser, "alias")
        expect(usedLimiter()).toBe("free")
    })

    it("charges the same user's drop calls to the PRO drop bucket", async () => {
        await checkApiQuota("u1", dropProUser, "drop")
        expect(usedLimiter()).toBe("dropPro")
    })

    it("grants a bundle/business plan's tier to every product bucket", async () => {
        const bundlePlus = {
            subscriptions: [{ status: "active", product: "bundle", tier: "plus", currentPeriodEnd: future }],
            referralPlusUntil: null,
        }
        await checkApiQuota("u1", bundlePlus, "form")
        expect(usedLimiter()).toBe("formPlus")
    })

    it("reads a product bucket without consuming it", async () => {
        await readApiQuota("u1", dropProUser, "form")
        expect(limiters.formFree.getRemaining).toHaveBeenCalledWith("u1")
        expect(limiters.formFree.limit).not.toHaveBeenCalled()
    })
})
