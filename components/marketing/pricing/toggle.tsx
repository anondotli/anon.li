"use strict";
"use client"

import * as React from "react"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

interface PricingToggleProps {
    isYearly: boolean
    onToggle: (checked: boolean) => void
}

export function PricingToggle({ isYearly, onToggle }: PricingToggleProps) {
    return (
        <div className="flex items-center justify-center space-x-4">
            <Label htmlFor="pricing-mode" className={`text-base ${!isYearly ? "text-foreground font-semibold" : "text-muted-foreground"}`}>
                Monthly
            </Label>
            <Switch
                id="pricing-mode"
                checked={isYearly}
                onCheckedChange={onToggle}
            />
            <Label htmlFor="pricing-mode" className={`text-base ${isYearly ? "text-foreground font-semibold" : "text-muted-foreground"}`}>
                Yearly <span className="ml-1.5 inline-flex items-center rounded-full border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-500">-25%</span>
            </Label>
        </div>
    )
}
