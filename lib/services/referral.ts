import "server-only"

import { customAlphabet } from "nanoid"
import { prisma } from "@/lib/prisma"
import { DAY_MS } from "@/lib/constants"
import { createLogger } from "@/lib/logger"

const logger = createLogger("Referral")

/** Free Plus days granted to BOTH parties per successful referral. */
export const REFERRAL_REWARD_DAYS = 7
/** A referral can only be claimed within this window after the account is created. */
const REFERRAL_CLAIM_WINDOW_DAYS = 30
/** Unambiguous alphabet (no 0/O/1/I) for human-shareable codes. */
const generateCode = customAlphabet("23456789ABCDEFGHJKLMNPQRSTUVWXYZ", 8)

export type ClaimResult =
    | { status: "claimed"; rewardDays: number }
    | { status: "already_claimed" }
    | { status: "invalid_code" }
    | { status: "self_referral" }
    | { status: "window_expired" }
    | { status: "no_cookie" }
    // Transient failure (e.g. DB deadlock). NOT terminal — the caller should keep
    // the referral cookie so a later load can retry instead of burning the reward.
    | { status: "error" }

/** Statuses after which the pending referral cookie can be safely discarded. */
export const TERMINAL_CLAIM_STATUSES: ReadonlySet<ClaimResult["status"]> = new Set([
    "claimed",
    "already_claimed",
    "invalid_code",
    "self_referral",
    "window_expired",
    "no_cookie",
])

/** Normalize a raw referral code from a URL/cookie into the stored form. */
export function normalizeReferralCode(raw: string | null | undefined): string | null {
    if (!raw) return null
    const cleaned = raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
    if (cleaned.length < 6 || cleaned.length > 16) return null
    return cleaned
}

/** Lazily generate (and persist) a user's own referral code. Idempotent. */
async function getOrCreateReferralCode(userId: string): Promise<string> {
    const existing = await prisma.user.findUnique({
        where: { id: userId },
        select: { referralCode: true },
    })
    if (existing?.referralCode) return existing.referralCode

    // Retry on the (extremely unlikely) unique-collision.
    for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateCode()
        try {
            const updated = await prisma.user.update({
                where: { id: userId },
                data: { referralCode: code },
                select: { referralCode: true },
            })
            return updated.referralCode!
        } catch {
            // Another request may have set the code first, or the code collided.
            const current = await prisma.user.findUnique({
                where: { id: userId },
                select: { referralCode: true },
            })
            if (current?.referralCode) return current.referralCode
            logger.warn("Referral code generation retry", { attempt })
        }
    }
    throw new Error("Failed to generate referral code")
}

/**
 * Extend a user's complimentary Plus window by `days`, never shortening it.
 * Done as a single atomic SQL statement so concurrent claims for the SAME
 * referrer can't lose each other's grant (read-modify-write under READ COMMITTED
 * would otherwise drop a stacked reward). `GREATEST(..., now())` is the
 * never-shorten guard; `make_interval` adds the days server-side.
 */
async function extendReferralPlus(
    tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
    userId: string,
    days: number,
): Promise<void> {
    await tx.$executeRaw`
        UPDATE "users"
        SET "referral_plus_until" =
            GREATEST(COALESCE("referral_plus_until", now()), now()) + make_interval(days => ${days}::int)
        WHERE "id" = ${userId}
    `
}

/**
 * Attribute a referral to `userId` and reward both parties with Plus.
 * Safe to call repeatedly: it no-ops once the user has already claimed.
 * Intended to run only for authenticated (therefore verified) users.
 */
export async function claimReferral(userId: string, rawCode: string | null): Promise<ClaimResult> {
    const code = normalizeReferralCode(rawCode)
    if (!code) return { status: "no_cookie" }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, referredByUserId: true, referralClaimedAt: true, createdAt: true },
    })
    if (!user) return { status: "invalid_code" }
    if (user.referredByUserId || user.referralClaimedAt) return { status: "already_claimed" }

    if (user.createdAt.getTime() + REFERRAL_CLAIM_WINDOW_DAYS * DAY_MS < Date.now()) {
        return { status: "window_expired" }
    }

    const referrer = await prisma.user.findUnique({
        where: { referralCode: code },
        select: { id: true },
    })
    if (!referrer) return { status: "invalid_code" }
    if (referrer.id === user.id) return { status: "self_referral" }

    try {
        await prisma.$transaction(async (tx) => {
            // Re-check inside the transaction to keep claiming idempotent under races.
            const fresh = await tx.user.findUnique({
                where: { id: userId },
                select: { referredByUserId: true, referralClaimedAt: true },
            })
            if (fresh?.referredByUserId || fresh?.referralClaimedAt) return

            await tx.user.update({
                where: { id: userId },
                data: { referredByUserId: referrer.id, referralClaimedAt: new Date() },
            })
            await extendReferralPlus(tx, userId, REFERRAL_REWARD_DAYS)
            await extendReferralPlus(tx, referrer.id, REFERRAL_REWARD_DAYS)
        })
    } catch (error) {
        // A genuine failure (deadlock, connection blip) — surface it as transient
        // so the caller keeps the cookie and retries, rather than silently burning
        // the referral by reporting it as already-claimed.
        logger.error("Failed to claim referral", error, { userId })
        return { status: "error" }
    }

    return { status: "claimed", rewardDays: REFERRAL_REWARD_DAYS }
}

/**
 * Pre-signup preview of a pending referral. Confirms the raw code (from the
 * `?ref` URL param or first-touch `anonli_ref` cookie) maps to a real referrer
 * so the register page can truthfully promise the reward *before* the account
 * exists. Read-only — no attribution, no account required. Self-referral can't
 * be detected yet (there's no account to compare against), which is fine: the
 * authoritative {@link claimReferral} still rejects it at claim time.
 */
export async function getReferralRewardPreview(
    rawCode: string | null | undefined,
): Promise<{ rewardDays: number } | null> {
    const code = normalizeReferralCode(rawCode)
    if (!code) return null

    const referrer = await prisma.user.findUnique({
        where: { referralCode: code },
        select: { id: true },
    })
    if (!referrer) return null

    return { rewardDays: REFERRAL_REWARD_DAYS }
}

export interface ReferralStats {
    code: string
    successfulReferrals: number
    plusUntil: Date | null
    /** Whether plusUntil is still in the future. Computed here so React render
     *  paths don't have to call the impure Date.now() themselves. */
    plusActive: boolean
}

/** Stats for the invite UI: the user's code, how many friends they've converted,
 *  and when their complimentary Plus (if any) lapses. */
export async function getReferralStats(userId: string): Promise<ReferralStats> {
    const code = await getOrCreateReferralCode(userId)
    const [successfulReferrals, user] = await Promise.all([
        prisma.user.count({ where: { referredByUserId: userId } }),
        prisma.user.findUnique({ where: { id: userId }, select: { referralPlusUntil: true } }),
    ])
    const plusUntil = user?.referralPlusUntil ?? null
    return {
        code,
        successfulReferrals,
        plusUntil,
        plusActive: plusUntil ? plusUntil.getTime() > Date.now() : false,
    }
}
