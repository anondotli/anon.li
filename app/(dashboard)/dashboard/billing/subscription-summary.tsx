"use client"

import Link from "next/link"
import { useState } from "react"
import { Card, CardContent, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ManageSubscriptionButton } from "./manage-button"
import { PaymentMethodDialog } from "@/components/billing"
import { formatDate } from "@/lib/admin/format"

interface SubscriptionSummaryProps {
    planId: string
    status?: string
    currentPeriodEnd?: Date
    paymentMethod?: string
    product?: string
}

function getPricingHref(product?: string) {
    if (product === "alias") return "/pricing?alias"
    if (product === "drop") return "/pricing?drop"
    return "/pricing"
}

export function SubscriptionSummary({ planId, status, currentPeriodEnd, paymentMethod, product }: SubscriptionSummaryProps) {
    const [showRenewDialog, setShowRenewDialog] = useState(false)
    const isPro = planId === "pro"
    const isPlus = planId === "plus"
    const isPaid = isPro || isPlus
    const isCrypto = paymentMethod === "crypto"

    const formatDateStr = (date?: Date) => {
        if (!date) return "N/A"
        return formatDate(date)
    }

    // Capture current time once on mount to avoid impure Date.now() during render
    const [now] = useState(() => Date.now())

    // Check if within 30 days of expiry for renewal urgency
    const daysUntilExpiry = currentPeriodEnd
        ? Math.ceil((new Date(currentPeriodEnd).getTime() - now) / (1000 * 60 * 60 * 24))
        : null
    const showRenewalUrgency = isCrypto && isPaid && daysUntilExpiry !== null && daysUntilExpiry <= 30 && daysUntilExpiry > 0

    return (
        <>
            <Card className="rounded-3xl border-border/40 shadow-sm overflow-hidden">
                <div className="bg-secondary/30 border-b border-border/40 p-8 pb-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <CardTitle className="text-2xl font-medium font-serif mb-2">Your Subscription</CardTitle>
                            <p className="text-muted-foreground font-light">
                                Current plan and billing status
                            </p>
                        </div>
                        {!isPaid && (
                            <Button
                                asChild
                                variant="default"
                                className="w-full sm:w-auto rounded-full px-6 bg-primary text-primary-foreground hover:bg-primary/90"
                            >
                                <Link href={getPricingHref(product)}>Upgrade Plan</Link>
                            </Button>
                        )}
                        {isPaid && !isCrypto && (
                            <ManageSubscriptionButton
                                variant="default"
                                label="Manage Subscription"
                                className="w-full sm:w-auto"
                            />
                        )}
                        {isPaid && isCrypto && (
                            <Button
                                variant="default"
                                className="w-full sm:w-auto rounded-full px-6 bg-primary text-primary-foreground hover:bg-primary/90"
                                onClick={() => setShowRenewDialog(true)}
                            >
                                Renew Subscription
                            </Button>
                        )}
                    </div>
                </div>
                <CardContent className="p-8">
                    <div className="grid gap-6 md:grid-cols-3">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground mb-1">Current Plan</p>
                            <div className="flex items-center gap-2">
                                <span className="text-xl font-medium capitalize">{planId} Plan</span>
                                {isPaid && <Badge variant="secondary" className="capitalize">{status || "active"}</Badge>}
                                {isPaid && isCrypto && <Badge variant="outline">Crypto</Badge>}
                            </div>
                        </div>

                        {isPaid && currentPeriodEnd && (
                            <div>
                                <p className="text-sm font-medium text-muted-foreground mb-1">
                                    {isCrypto || status === "canceled" ? "Expires On" : "Renews On"}
                                </p>
                                <p className="text-xl font-medium">{formatDateStr(currentPeriodEnd)}</p>
                                {showRenewalUrgency && (
                                    <p className="text-sm text-amber-600 mt-1">
                                        {daysUntilExpiry} {daysUntilExpiry === 1 ? "day" : "days"} remaining
                                    </p>
                                )}
                            </div>
                        )}

                        {!isPaid && (
                            <div>
                                <p className="text-sm font-medium text-muted-foreground mb-1">Status</p>
                                <p className="text-xl font-medium">Active</p>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
            <PaymentMethodDialog
                open={showRenewDialog}
                onOpenChange={setShowRenewDialog}
                product={product ?? "bundle"}
                tier={planId}
            />
        </>
    )
}
