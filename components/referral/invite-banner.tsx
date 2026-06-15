"use client"

import { useEffect, useState } from "react"
import { Check, Copy, Gift, PartyPopper, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { analytics } from "@/lib/analytics"
import { useClipboard } from "@/hooks/use-clipboard"

/**
 * localStorage key storing the referral count at the moment of dismissal.
 * The banner re-appears once `successfulReferrals` exceeds that stored count,
 * so a new conversion always re-surfaces the "invite another" nudge.
 */
const DISMISS_KEY = "anon-li-invite-banner-dismissed-count"

interface InviteBannerProps {
    link: string
    successfulReferrals: number
    rewardDays: number
}

/**
 * Dismissible invite nudge shown at the top of the dashboard. The settings page
 * keeps the full {@link InviteFriends} card; this is the high-visibility entry
 * point so every active user actually finds their referral link.
 */
export function InviteBanner({ link, successfulReferrals, rewardDays }: InviteBannerProps) {
    // Start hidden so SSR and the first client paint agree (no hydration flash);
    // the effect reveals it once we've read localStorage. Mirrors FeaturePromptGrid.
    const [visible, setVisible] = useState(false)
    const { copied, copy: copyToClipboard } = useClipboard()

    useEffect(() => {
        const timer = window.setTimeout(() => {
            const raw = localStorage.getItem(DISMISS_KEY)
            if (raw === null) {
                setVisible(true)
                return
            }
            const dismissedAtCount = Number(raw)
            // Re-show if a new friend has joined since the user dismissed it.
            setVisible(Number.isFinite(dismissedAtCount) ? successfulReferrals > dismissedAtCount : true)
        }, 0)
        return () => window.clearTimeout(timer)
    }, [successfulReferrals])

    const copy = async () => {
        if (await copyToClipboard(link)) {
            analytics.referralLinkCopied("dashboard_banner")
            toast.success("Referral link copied!")
        }
    }

    const dismiss = () => {
        localStorage.setItem(DISMISS_KEY, String(successfulReferrals))
        setVisible(false)
    }

    if (!visible) return null

    const hasReferrals = successfulReferrals > 0

    return (
        <section className="relative rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
            <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-3 top-3 h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
                onClick={dismiss}
                aria-label="Dismiss invite banner"
            >
                <X className="h-4 w-4" />
            </Button>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex items-start gap-3 pr-8 sm:pr-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        {hasReferrals ? (
                            <PartyPopper className="h-5 w-5 text-primary" />
                        ) : (
                            <Gift className="h-5 w-5 text-primary" />
                        )}
                    </div>
                    <div className="space-y-0.5">
                        <p className="font-medium">
                            {hasReferrals
                                ? `Nice — ${successfulReferrals} ${successfulReferrals === 1 ? "friend has" : "friends have"} joined`
                                : "Invite a friend, you both get Plus free"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                            {hasReferrals
                                ? `Invite another and you'll both get ${rewardDays} more days of Plus.`
                                : `When a friend signs up with your link, you both get ${rewardDays} days of Plus — and it stacks with every referral.`}
                        </p>
                    </div>
                </div>

                <div className="flex gap-2 sm:ml-auto sm:w-auto sm:shrink-0">
                    <Input
                        value={link}
                        readOnly
                        aria-label="Your referral link"
                        className="h-11 rounded-xl border-0 bg-background font-mono text-xs sm:w-72"
                    />
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={copy}
                        aria-label="Copy referral link"
                        className="h-11 w-11 shrink-0 rounded-xl border-border/50 hover:border-primary/30 hover:bg-primary/5"
                    >
                        {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    </Button>
                </div>
            </div>
        </section>
    )
}
