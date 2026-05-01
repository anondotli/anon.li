"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { createCheckoutSession } from "@/actions/create-checkout-session"
import { toast } from "sonner"
import { User } from "@/types/auth"
import Link from "next/link"
import { PaymentMethodDialog } from "@/components/billing"
import { analytics } from "@/lib/analytics"

function getTierDisplayName(planId: string): string {
    const tier = planId.includes("_") ? planId.split("_")[1] : planId
    if (tier === "free") return "Free"
    if (tier === "plus") return "Plus"
    if (tier === "pro") return "Pro"
    return tier || planId
}

interface PricingActionProps {
    user: User | null | undefined
    planId: string
    isYearly?: boolean
    className?: string
    /** Optional promotion/coupon code to pre-apply at checkout */
    promoCode?: string
    /** Full plan ID of the user's current plan (e.g. "bundle_plus") */
    currentPlanId?: string | null
}

export function PricingAction({ user, planId, isYearly, className, promoCode, currentPlanId }: PricingActionProps) {
    const [isPending, startTransition] = useTransition()
    const [showPaymentDialog, setShowPaymentDialog] = useState(false)

    // Parse plan ID into product and tier (e.g., "bundle_plus" -> { product: "bundle", tier: "plus" })
    const [product, tier] = planId.includes("_")
        ? planId.split("_") as [string, string]
        : ["bundle", planId] // Legacy fallback

    const displayName = getTierDisplayName(planId)
    const isFree = tier === "free"

    // Not logged in: Redirect to register with product intent
    if (!user) {
        const registerUrl = product ? `/register?from=${product}` : "/register"
        return (
            <Button variant={isFree ? "outline" : "default"} size="lg" className={className} asChild>
                <Link href={registerUrl}>
                    Start with {displayName}
                </Link>
            </Button>
        )
    }

    // Logged in: Handle plans

    const isCurrentPlan = currentPlanId ? planId === currentPlanId : isFree

    if (isCurrentPlan) {
        return (
            <Button disabled variant="outline" size="lg" className={`${className} bg-muted text-muted-foreground border-transparent`}>
                Current Plan
            </Button>
        )
    }

    if (tier === "plus" || tier === "pro") {
        const handleUpgrade = () => {
            analytics.upgradeClicked(product, tier)

            // Yearly plans: show payment method dialog (card or crypto)
            if (isYearly) {
                setShowPaymentDialog(true)
                return
            }

            // Monthly plans: go directly to Stripe
            startTransition(async () => {
                analytics.checkoutStarted(product, tier, "monthly")
                try {
                    const result = await createCheckoutSession({
                        product: product as "bundle" | "alias" | "drop" | "form",
                        tier: tier as "plus" | "pro",
                        frequency: "monthly",
                        promoCode: promoCode
                    })
                    if (result?.error) {
                        toast.error(result.error)
                    }
                } catch {
                    // Error handled by createCheckoutSession
                }
            })
        }

        return (
            <>
                <Button
                    onClick={handleUpgrade}
                    disabled={isPending}
                    size="lg"
                    className={className}
                >
                    {isPending ? "Loading..." : `Upgrade to ${displayName}`}
                </Button>
                <PaymentMethodDialog
                    open={showPaymentDialog}
                    onOpenChange={setShowPaymentDialog}
                    product={product}
                    tier={tier}
                    promoCode={promoCode}
                />
            </>
        )
    }

    return null
}
