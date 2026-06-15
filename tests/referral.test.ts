import { describe, it, expect, vi, beforeEach, type Mock } from "vitest"
import { getEffectiveTier, getDropLimits, getPlanLimits } from "@/lib/limits"
import { STORAGE_LIMITS, PLAN_ENTITLEMENTS } from "@/config/plans"

vi.mock("@/lib/prisma", () => ({
    prisma: {
        user: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
        $transaction: vi.fn(),
    },
}))

import { prisma } from "@/lib/prisma"
import { claimReferral, getReferralRewardPreview, normalizeReferralCode, REFERRAL_REWARD_DAYS } from "@/lib/services/referral"
import { getUserAndLimits } from "@/lib/drop-utils"

const prismaMock = prisma as unknown as {
    user: { findUnique: Mock; update: Mock; count: Mock }
    $transaction: Mock
}

const daysFromNow = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000)

describe("referral Plus entitlement bump", () => {
    it("grants Plus across products while referralPlusUntil is in the future", () => {
        const user = { subscriptions: [], referralPlusUntil: daysFromNow(10) }
        expect(getEffectiveTier(user)).toBe("plus")
        expect(getDropLimits(user).maxStorage).toBe(STORAGE_LIMITS.plus)
        expect(getPlanLimits(user).random).toBe(PLAN_ENTITLEMENTS.alias.plus.random)
    })

    it("does not grant Plus once referralPlusUntil has passed", () => {
        const user = { subscriptions: [], referralPlusUntil: daysFromNow(-1) }
        expect(getEffectiveTier(user)).toBe("free")
        expect(getDropLimits(user).maxStorage).toBe(STORAGE_LIMITS.free)
    })

    it("never downgrades a paid Pro subscription", () => {
        const user = {
            subscriptions: [{ status: "active", product: "bundle", tier: "pro", currentPeriodEnd: daysFromNow(20) }],
            referralPlusUntil: daysFromNow(10),
        }
        expect(getEffectiveTier(user)).toBe("pro")
        expect(getDropLimits(user).maxStorage).toBe(STORAGE_LIMITS.pro)
    })

    it("treats a missing referralPlusUntil as no bump", () => {
        expect(getEffectiveTier({ subscriptions: [] })).toBe("free")
    })
})

describe("getUserAndLimits honors referral Plus", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    // Guards the call-site reshaping in drop-utils: the upload entitlement must
    // carry referralPlusUntil through to getDropLimits/getEffectiveTier, or a
    // referral-Plus user gets free upload limits despite the dashboard showing Plus.
    it("applies the bump to drop upload enforcement", async () => {
        prismaMock.user.findUnique.mockResolvedValueOnce({
            id: "u1",
            banned: false,
            banFileUpload: false,
            banReason: null,
            storageUsed: 0,
            referralPlusUntil: daysFromNow(10),
            subscriptions: [],
        })

        const result = await getUserAndLimits("u1")
        expect(result.tier).toBe("plus")
        expect(result.limits.maxStorage).toBe(STORAGE_LIMITS.plus)
    })

    it("does not bump once referralPlusUntil has passed", async () => {
        prismaMock.user.findUnique.mockResolvedValueOnce({
            id: "u1",
            banned: false,
            banFileUpload: false,
            banReason: null,
            storageUsed: 0,
            referralPlusUntil: daysFromNow(-1),
            subscriptions: [],
        })

        const result = await getUserAndLimits("u1")
        expect(result.tier).toBe("free")
        expect(result.limits.maxStorage).toBe(STORAGE_LIMITS.free)
    })
})

describe("normalizeReferralCode", () => {
    it("uppercases and strips non-alphanumerics", () => {
        expect(normalizeReferralCode("abc-123!")).toBe("ABC123")
    })
    it("rejects too-short and too-long codes, and nullish input", () => {
        expect(normalizeReferralCode("ab12")).toBeNull()
        expect(normalizeReferralCode("A".repeat(17))).toBeNull()
        expect(normalizeReferralCode(null)).toBeNull()
        expect(normalizeReferralCode(undefined)).toBeNull()
    })
})

describe("getReferralRewardPreview", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("returns null for a malformed code without hitting the DB", async () => {
        expect(await getReferralRewardPreview("ab12")).toBeNull()
        expect(await getReferralRewardPreview(null)).toBeNull()
        expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
    })

    it("returns null when no referrer owns the code", async () => {
        prismaMock.user.findUnique.mockResolvedValueOnce(null)
        expect(await getReferralRewardPreview("ABCD1234")).toBeNull()
    })

    it("previews the reward when the code maps to a real referrer", async () => {
        prismaMock.user.findUnique.mockResolvedValueOnce({ id: "referrer" })
        // Normalizes before lookup, so a messy URL value still resolves.
        expect(await getReferralRewardPreview("abcd-1234")).toEqual({ rewardDays: REFERRAL_REWARD_DAYS })
        expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
            expect.objectContaining({ where: { referralCode: "ABCD1234" } }),
        )
    })
})

describe("claimReferral", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("returns no_cookie for an invalid code", async () => {
        expect(await claimReferral("u1", null)).toEqual({ status: "no_cookie" })
        expect(prismaMock.$transaction).not.toHaveBeenCalled()
    })

    it("no-ops when the user already claimed a referral", async () => {
        prismaMock.user.findUnique.mockResolvedValueOnce({
            id: "u1", referredByUserId: "someone", referralClaimedAt: new Date(), createdAt: new Date(),
        })
        expect(await claimReferral("u1", "ABCD1234")).toEqual({ status: "already_claimed" })
        expect(prismaMock.$transaction).not.toHaveBeenCalled()
    })

    it("rejects a claim outside the signup window", async () => {
        prismaMock.user.findUnique.mockResolvedValueOnce({
            id: "u1", referredByUserId: null, referralClaimedAt: null, createdAt: daysFromNow(-40),
        })
        expect(await claimReferral("u1", "ABCD1234")).toEqual({ status: "window_expired" })
    })

    it("rejects self-referral", async () => {
        prismaMock.user.findUnique
            .mockResolvedValueOnce({ id: "u1", referredByUserId: null, referralClaimedAt: null, createdAt: new Date() })
            .mockResolvedValueOnce({ id: "u1" }) // referrer resolves to self
        expect(await claimReferral("u1", "ABCD1234")).toEqual({ status: "self_referral" })
    })

    it("rejects an unknown referral code", async () => {
        prismaMock.user.findUnique
            .mockResolvedValueOnce({ id: "u1", referredByUserId: null, referralClaimedAt: null, createdAt: new Date() })
            .mockResolvedValueOnce(null) // no referrer with that code
        expect(await claimReferral("u1", "ABCD1234")).toEqual({ status: "invalid_code" })
    })

    it("attributes and rewards both parties on a valid claim", async () => {
        prismaMock.user.findUnique
            .mockResolvedValueOnce({ id: "referee", referredByUserId: null, referralClaimedAt: null, createdAt: new Date() })
            .mockResolvedValueOnce({ id: "referrer" })

        const txUpdate = vi.fn().mockResolvedValue({})
        const txExecuteRaw = vi.fn().mockResolvedValue(1)
        const tx = {
            user: {
                findUnique: vi.fn().mockResolvedValue({ referredByUserId: null, referralClaimedAt: null }),
                update: txUpdate,
            },
            $executeRaw: txExecuteRaw,
        }
        prismaMock.$transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx))

        const result = await claimReferral("referee", "abcd-1234")
        expect(result).toEqual({ status: "claimed", rewardDays: REFERRAL_REWARD_DAYS })

        // Attribution is a single user.update; the two Plus grants go through the
        // atomic $executeRaw path (one per party), each for the reward window.
        expect(txUpdate).toHaveBeenCalledTimes(1)
        expect(txUpdate).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: "referee" },
            data: expect.objectContaining({ referredByUserId: "referrer" }),
        }))
        expect(txExecuteRaw).toHaveBeenCalledTimes(2)
        // Each grant interpolates the reward-day count and a distinct target id.
        for (const call of txExecuteRaw.mock.calls) {
            expect(call).toContain(REFERRAL_REWARD_DAYS)
        }
        const targets = txExecuteRaw.mock.calls.map((c) => c[c.length - 1])
        expect(targets).toEqual(expect.arrayContaining(["referee", "referrer"]))
    })

    it("returns error (not already_claimed) when the transaction throws", async () => {
        prismaMock.user.findUnique
            .mockResolvedValueOnce({ id: "referee", referredByUserId: null, referralClaimedAt: null, createdAt: new Date() })
            .mockResolvedValueOnce({ id: "referrer" })
        prismaMock.$transaction.mockRejectedValue(new Error("deadlock"))

        // A transient failure must stay non-terminal so the caller keeps the
        // cookie and retries, rather than burning the referral as already-claimed.
        expect(await claimReferral("referee", "abcd-1234")).toEqual({ status: "error" })
    })
})
