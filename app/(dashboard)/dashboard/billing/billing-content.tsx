"use client"

import Link from "next/link"
import { ArrowRight, Gift } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { SubscriptionSummary } from "./subscription-summary"

const referralDateFmt = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
})

interface ReferralSummary {
    successfulReferrals: number
    /** ISO date string, or null if the user has no complimentary Plus. */
    plusUntil: string | null
    /** Whether plusUntil is still in the future (computed server-side). */
    plusActive: boolean
    rewardDays: number
}

interface BillingContentProps {
    currentTier: "free" | "plus" | "pro"
    subscriptionStatus?: "active" | "past_due" | "canceled"
    currentPeriodEnd?: Date
    paymentMethod?: string
    product?: string
    referral?: ReferralSummary
}

export function BillingContent({
    currentTier,
    subscriptionStatus,
    currentPeriodEnd,
    paymentMethod,
    product,
    referral
}: BillingContentProps) {
    const referralPlusActive = referral?.plusActive ?? false
    const referralPlusLabel = referral?.plusUntil
        ? referralDateFmt.format(new Date(referral.plusUntil))
        : null
    return (
        <div className="space-y-10 max-w-5xl">
            <div className="space-y-6">
                <div>
                    <h2 className="text-3xl font-medium tracking-tight font-serif mb-2">Billing</h2>
                    <p className="text-muted-foreground font-light">
                        Manage your subscription and billing information.
                    </p>
                </div>

                <SubscriptionSummary
                    planId={currentTier}
                    status={subscriptionStatus}
                    currentPeriodEnd={currentPeriodEnd}
                    paymentMethod={paymentMethod}
                    product={product}
                />
            </div>

            {referral && (
                <div className="space-y-6">
                    <h3 className="text-xl font-medium font-serif">Referral Plus</h3>

                    <Card>
                        <CardContent className="space-y-4 p-6">
                            <div className="flex items-start gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                    <Gift className="h-5 w-5" />
                                </div>
                                <div className="space-y-1">
                                    {referralPlusActive && referralPlusLabel ? (
                                        <>
                                            <p className="font-medium">Complimentary Plus is active</p>
                                            <p className="text-sm text-muted-foreground">
                                                Earned through referrals — active until{" "}
                                                <span className="text-foreground">{referralPlusLabel}</span>. Each
                                                successful referral adds {referral.rewardDays} more days and stacks on top.
                                            </p>
                                        </>
                                    ) : (
                                        <>
                                            <p className="font-medium">Get Plus free by inviting friends</p>
                                            <p className="text-sm text-muted-foreground">
                                                When a friend signs up with your link, you both get {referral.rewardDays}{" "}
                                                days of Plus for free, and it stacks with every referral.
                                            </p>
                                        </>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            <div className="space-y-6">
                <h3 className="text-xl font-medium font-serif">Available Plans</h3>

                <Link href="/pricing" className="group block">
                    <Card className="transition-colors hover:bg-accent/50">
                        <CardContent className="flex items-center justify-between p-6">
                            <div className="space-y-1">
                                <p className="font-medium">View all plans</p>
                                <p className="text-sm text-muted-foreground">
                                    Compare features and find the right plan for you
                                </p>
                            </div>
                            <ArrowRight className="h-5 w-5 text-muted-foreground transition-all group-hover:translate-x-1 group-hover:text-foreground" />
                        </CardContent>
                    </Card>
                </Link>
            </div>
        </div>
    )
}
