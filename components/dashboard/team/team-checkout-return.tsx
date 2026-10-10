"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { analytics } from "@/lib/analytics"

/** How often (ms) and how many times to re-read the plan while Stripe's webhook lands. */
export const TEAM_CHECKOUT_POLL_INTERVAL_MS = 3000
export const TEAM_CHECKOUT_MAX_POLLS = 20

type CheckoutReturn = "success" | "canceled" | null

/**
 * Handles the Stripe return to /dashboard/team (`?success=true` /
 * `?canceled=true`), mirroring the personal BillingToast: fires
 * checkout_completed once, toasts, and strips the query param. The team plan
 * is activated by the Stripe webhook, which can land after the redirect — so
 * until the server reports an active subscription this shows a pending state
 * and re-reads the page.
 */
export function TeamCheckoutReturn({ subscribed }: { subscribed: boolean }) {
    const searchParams = useSearchParams()
    const router = useRouter()
    // Captured once: the URL is cleaned right away, but the pending state must
    // outlive the query param.
    const [checkoutReturn] = useState<CheckoutReturn>(() =>
        searchParams.get("success") === "true"
            ? "success"
            : searchParams.get("canceled") === "true"
                ? "canceled"
                : null,
    )
    const [timedOut, setTimedOut] = useState(false)
    const handled = useRef(false)
    const activationToastShown = useRef(false)

    useEffect(() => {
        if (handled.current || !checkoutReturn) return
        handled.current = true
        if (checkoutReturn === "success") {
            analytics.checkoutCompleted("card")
        } else {
            toast.error("Checkout canceled", {
                description: "Your payment was canceled. No charges were made.",
            })
        }
        router.replace("/dashboard/team")
    }, [checkoutReturn, router])

    useEffect(() => {
        if (checkoutReturn !== "success" || !subscribed || activationToastShown.current) return
        activationToastShown.current = true
        toast.success("Team plan active!", {
            description: "Thank you for your purchase. Your seats are ready — invite your teammates.",
        })
    }, [checkoutReturn, subscribed])

    const pending = checkoutReturn === "success" && !subscribed && !timedOut

    useEffect(() => {
        if (!pending) return
        let polls = 0
        const id = window.setInterval(() => {
            polls += 1
            if (polls > TEAM_CHECKOUT_MAX_POLLS) {
                window.clearInterval(id)
                setTimedOut(true)
                toast.info("Payment received — your team plan is still activating", {
                    description: "This can take a minute. Refresh the page shortly to see your seats.",
                })
                return
            }
            router.refresh()
        }, TEAM_CHECKOUT_POLL_INTERVAL_MS)
        return () => window.clearInterval(id)
    }, [pending, router])

    if (!pending) return null

    return (
        <div
            role="status"
            className="mb-6 flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm"
        >
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
            <span>
                Finishing your checkout — your team plan activates as soon as Stripe confirms the payment.
            </span>
        </div>
    )
}
