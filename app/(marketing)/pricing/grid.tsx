"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { Package, Mail, FileUp } from "lucide-react"
import { PricingToggle } from "@/components/marketing/pricing/toggle"
import { BUNDLE_PLANS, ALIAS_PLANS, DROP_PLANS } from "@/config/plans"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PricingFAQ } from "@/components/marketing/pricing/faq"
import { PricingPlanCard } from "@/components/marketing/pricing/plan-card"

import { User } from "@/types/auth"

interface PricingGridProps {
    user: User | null
    currentPlanId: string | null
}

type ProductType = "bundle" | "alias" | "drop"

const PRODUCT_CONFIG = {
    bundle: {
        name: "Bundle",
        description: "Complete privacy suite with email aliases and encrypted file sharing",
        icon: Package,
        plans: BUNDLE_PLANS,
    },
    alias: {
        name: "Alias",
        description: "Anonymous email aliases to protect your inbox",
        icon: Mail,
        plans: ALIAS_PLANS,
    },
    drop: {
        name: "Drop",
        description: "End-to-end encrypted file sharing",
        icon: FileUp,
        plans: DROP_PLANS,
    },
}

export function PricingGrid({ user, currentPlanId }: PricingGridProps) {
    const searchParams = useSearchParams()
    const [isYearly, setIsYearly] = useState(true)

    const getInitialProduct = (): ProductType => {
        if (searchParams.has("alias")) return "alias"
        if (searchParams.has("drop")) return "drop"
        return "bundle"
    }

    const [product, setProduct] = useState<ProductType>(getInitialProduct)

    const currentConfig = PRODUCT_CONFIG[product]
    const plans = currentConfig.plans

    return (
        <div className="py-24 md:py-32 bg-background">
            <div className="container mx-auto px-6 max-w-6xl">
                <div className="text-center space-y-6 mb-12">
                    <h1 className="text-5xl md:text-6xl font-serif font-medium tracking-tight text-primary">
                        Use for free, forever.<br />
                        <span className="italic">Upgrade for extras.</span>
                    </h1>
                    <p className="text-lg text-muted-foreground max-w-2xl mx-auto font-light leading-relaxed">
                        Privacy tools that respect you. Start free, upgrade when you need more.
                    </p>
                </div>

                {/* Product Selector */}
                <Tabs value={product} onValueChange={(v) => setProduct(v as ProductType)} className="mb-12">
                    <TabsList className="grid w-full max-w-xl mx-auto grid-cols-3 h-auto p-1.5 bg-secondary/50 rounded-2xl">
                        {(Object.keys(PRODUCT_CONFIG) as ProductType[]).map((key) => {
                            const config = PRODUCT_CONFIG[key]
                            const Icon = config.icon
                            return (
                                <TabsTrigger
                                    key={key}
                                    value={key}
                                    className="flex items-center gap-2 py-3 px-4 rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all"
                                >
                                    <Icon className="h-4 w-4" />
                                    <span className="font-medium">{config.name}</span>
                                </TabsTrigger>
                            )
                        })}
                    </TabsList>
                </Tabs>

                {/* Product Description */}
                <p className="text-center text-muted-foreground mb-8 font-light">
                    {currentConfig.description}
                </p>

                {/* Billing Toggle */}
                <div className="flex justify-center mb-12">
                    <PricingToggle isYearly={isYearly} onToggle={setIsYearly} />
                </div>

                <div className="grid md:grid-cols-3 gap-8 items-start mb-24 max-w-7xl mx-auto">
                    {/* Free Plan */}
                    <PricingPlanCard
                        plan={plans.free}
                        user={user}
                        isYearly={isYearly}
                        planId="free"
                        product={product}
                        currentPlanId={currentPlanId}
                    />

                    {/* Plus Plan */}
                    <PricingPlanCard
                        plan={plans.plus}
                        user={user}
                        isYearly={isYearly}
                        planId="plus"
                        product={product}
                        currentPlanId={currentPlanId}
                        isPopular
                    />

                    {/* Pro Plan */}
                    <PricingPlanCard
                        plan={plans.pro}
                        user={user}
                        isYearly={isYearly}
                        planId="pro"
                        product={product}
                        currentPlanId={currentPlanId}
                        isDark
                    />
                </div>

                {/* FAQ Section */}
                <PricingFAQ />
            </div>
        </div>
    )
}

