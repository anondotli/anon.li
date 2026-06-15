"use server"

import { auth } from "@/auth"
import { cookies } from "next/headers"
import { claimReferral, TERMINAL_CLAIM_STATUSES } from "@/lib/services/referral"

/**
 * Consume the first-touch `anonli_ref` cookie for the signed-in (therefore
 * email-verified) user. Runs from the dashboard, which is the earliest point we
 * can be sure the referred account is real — this is what keeps unverified
 * sign-ups from farming referrer rewards.
 *
 * Intentionally not wrapped in runSecureAction: this is a best-effort,
 * fire-on-load action that returns a "nothing to do" shape ({ claimed: false })
 * rather than an error when there's no session/cookie, and must not be gated on
 * 2FA verification.
 */
export async function claimReferralFromCookie(): Promise<{ claimed: boolean; rewardDays: number; retry: boolean }> {
    const session = await auth()
    if (!session?.user?.id) return { claimed: false, rewardDays: 0, retry: false }

    const cookieStore = await cookies()
    const ref = cookieStore.get("anonli_ref")?.value ?? null
    if (!ref) return { claimed: false, rewardDays: 0, retry: false }

    const result = await claimReferral(session.user.id, ref)

    // Drop the cookie only once we've reached a terminal outcome so it can't be
    // re-evaluated. (A malformed/empty value yields "no_cookie" and is cleared
    // too.) A transient "error" keeps the cookie so a later load can retry
    // instead of permanently burning the referral.
    if (TERMINAL_CLAIM_STATUSES.has(result.status)) {
        cookieStore.delete("anonli_ref")
    }

    return {
        claimed: result.status === "claimed",
        rewardDays: result.status === "claimed" ? result.rewardDays : 0,
        retry: result.status === "error",
    }
}
