"use client"

import { Tag } from "lucide-react"

import type { Promotion } from "@/config/promotions"
import { formatPromotionEnd, PromoCodeButton } from "@/components/promotions/promo-bar"

/** Offer callout at the top of /pricing. Only rendered for viewers who aren't paying customers. */
export function PricingPromoBanner({ promotion }: { promotion: Promotion }) {
    return (
        <div className="mx-auto mb-12 flex max-w-3xl flex-col items-center gap-4 rounded-2xl border border-primary/20 bg-primary/5 px-6 py-5 text-center sm:flex-row sm:text-left">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Tag className="h-5 w-5" />
            </div>
            <div className="flex-1 space-y-1">
                <p className="font-medium">
                    {promotion.name}: {promotion.percentOff}% off all plans for {promotion.durationMonths} months
                </p>
                <p className="text-sm text-muted-foreground">
                    Enter the code when paying by card. Ends {formatPromotionEnd(promotion, true)}.
                </p>
            </div>
            <PromoCodeButton code={promotion.code} className="px-3 py-1.5 text-sm" />
        </div>
    )
}
