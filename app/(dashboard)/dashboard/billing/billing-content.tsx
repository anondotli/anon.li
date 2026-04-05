"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { SubscriptionSummary } from "./subscription-summary"

interface BillingContentProps {
    currentTier: "free" | "plus" | "pro"
    subscriptionStatus?: "active" | "past_due" | "canceled"
    currentPeriodEnd?: Date
    paymentMethod?: string
    product?: string
}

export function BillingContent({
    currentTier,
    subscriptionStatus,
    currentPeriodEnd,
    paymentMethod,
    product
}: BillingContentProps) {
    return (
        <div className="space-y-10 max-w-5xl">
            <div className="space-y-6">
                <div>
                    <h3 className="text-3xl font-medium tracking-tight font-serif mb-2">Billing</h3>
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

            <div className="space-y-6">
                <h4 className="text-xl font-medium font-serif">Available Plans</h4>

                <Link
                    href="/pricing"
                    className="group flex items-center justify-between p-6 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                    <div className="space-y-1">
                        <p className="font-medium">View all plans</p>
                        <p className="text-sm text-muted-foreground">
                            Compare features and find the right plan for you
                        </p>
                    </div>
                    <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all" />
                </Link>
            </div>
        </div>
    )
}
