"use client"

import { useEffect, useRef } from "react"
import { toast } from "sonner"
import { claimReferralFromCookie } from "@/actions/referral"

/**
 * Invisible dashboard helper that consumes a pending referral cookie once per
 * browser session. The server action no-ops cheaply when there's no cookie, and
 * clears it after a terminal outcome, so this stays effectively free after the
 * first run.
 */
export function ReferralClaim() {
    const ran = useRef(false)

    useEffect(() => {
        if (ran.current) return
        ran.current = true
        if (sessionStorage.getItem("anonli_ref_checked")) return

        claimReferralFromCookie()
            .then((res) => {
                // Only mark the session "checked" on a terminal outcome. A
                // transient failure (res.retry) leaves it unset so a later
                // navigation re-attempts the claim instead of losing the reward.
                if (!res.retry) sessionStorage.setItem("anonli_ref_checked", "1")
                if (res.claimed) {
                    toast.success(`Referral applied — ${res.rewardDays} days of Plus, on us!`)
                }
            })
            .catch(() => {
                // Network/abort: leave the guard unset so a later load can retry.
            })
    }, [])

    return null
}
