"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Check, Copy, X } from "lucide-react"
import { toast } from "sonner"

import type { Promotion } from "@/config/promotions"
import { useClipboard } from "@/hooks/use-clipboard"
import { cn } from "@/lib/utils"

const endDayFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
const endTimeFmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
})

/** When the offer ends, in UTC to match the Stripe code's expiry: "Dec 6", or "Dec 6, 23:59 UTC". */
export function formatPromotionEnd(promotion: Promotion, withTime = false): string {
    return withTime ? `${endTimeFmt.format(promotion.endsAt)} UTC` : endDayFmt.format(promotion.endsAt)
}

/** The promo code as a click-to-copy chip. */
export function PromoCodeButton({ code, className }: { code: string; className?: string }) {
    const { copied, copy } = useClipboard()

    const handleCopy = async () => {
        if (await copy(code)) toast.success(`Code ${code} copied`)
    }

    return (
        <button
            type="button"
            onClick={handleCopy}
            aria-label={`Copy promo code ${code}`}
            className={cn(
                "inline-flex items-center gap-1.5 rounded-md border border-dashed border-primary/40 bg-background px-2 py-0.5 align-middle font-mono text-xs font-semibold tracking-wide text-foreground transition-colors hover:border-primary",
                className,
            )}
        >
            {code}
            {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
        </button>
    )
}

const dismissKey = (promotionId: string) => `anon-li-promo-dismissed:${promotionId}`

/**
 * Slim, dismissible offer strip. Callers decide eligibility (never render it
 * for paying customers); dismissal is remembered per promotion in this browser.
 */
export function PromoBar({ promotion }: { promotion: Promotion }) {
    // Start hidden so SSR and the first client paint agree; the effect reveals
    // it once we know it wasn't dismissed. Mirrors InviteBanner.
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        const timer = window.setTimeout(() => {
            let dismissed = false
            try {
                dismissed = localStorage.getItem(dismissKey(promotion.id)) !== null
            } catch {
                // Storage blocked: show the offer, dismissal just won't persist.
            }
            setVisible(!dismissed)
        }, 0)
        return () => window.clearTimeout(timer)
    }, [promotion.id])

    const dismiss = () => {
        try {
            localStorage.setItem(dismissKey(promotion.id), "1")
        } catch {
            // Storage blocked: hide for this page view only.
        }
        setVisible(false)
    }

    if (!visible) return null

    return (
        <div role="region" aria-label={`${promotion.name} offer`} className="border-b border-primary/15 bg-primary/5">
            <div className="container flex items-center gap-3 px-4 py-2 sm:px-6">
                <p className="flex-1 text-center text-sm leading-relaxed text-foreground">
                    <span className="font-medium">{promotion.name}:</span>{" "}
                    {promotion.percentOff}% off all plans for {promotion.durationMonths} months with code{" "}
                    <PromoCodeButton code={promotion.code} />
                    <span className="hidden text-muted-foreground sm:inline"> · Ends {formatPromotionEnd(promotion)}</span>{" "}
                    <Link href="/pricing" className="whitespace-nowrap font-medium underline underline-offset-4 hover:text-primary">
                        See plans
                    </Link>
                </p>
                <button
                    type="button"
                    onClick={dismiss}
                    aria-label={`Dismiss ${promotion.name} offer`}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
        </div>
    )
}
