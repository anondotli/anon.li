"use client"

import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Package, Mail, FileUp } from "lucide-react"
import { PricingToggle } from "@/components/marketing/pricing/toggle"
import { BUNDLE_PLANS, ALIAS_PLANS, DROP_PLANS } from "@/config/plans"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PricingFAQ } from "@/components/marketing/pricing/faq"
import { PricingPlanCard } from "@/components/marketing/pricing/plan-card"
import { PricingTrustRow } from "@/components/marketing/pricing/trust-row"

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

type PlanTier = "free" | "plus" | "pro"

function parseHighlight(raw: string | null): { product: ProductType; tier: PlanTier } | null {
    if (!raw) return null
    const [p, t] = raw.split("_")
    const productOk = p === "bundle" || p === "alias" || p === "drop"
    const tierOk = t === "plus" || t === "pro" || t === "free"
    if (!productOk || !tierOk) return null
    return { product: p as ProductType, tier: t as PlanTier }
}

export function PricingGrid({ user, currentPlanId }: PricingGridProps) {
    const searchParams = useSearchParams()
    const [isYearly, setIsYearly] = useState(true)

    const [selection, setSelection] = useState<{ product: ProductType; highlightedTier: PlanTier | null }>(() => {
        // `?highlight=<product>_<tier>` takes precedence (sent by upgrade-required
        // dialogs and growth emails) — falls back to the legacy `?alias` / `?drop`
        // presence flags for deep links from marketing pages.
        const parsed = parseHighlight(searchParams.get("highlight"))
        if (parsed) return { product: parsed.product, highlightedTier: parsed.tier }
        if (searchParams.has("alias")) return { product: "alias", highlightedTier: null }
        if (searchParams.has("drop")) return { product: "drop", highlightedTier: null }
        return { product: "bundle", highlightedTier: null }
    })

    const { product, highlightedTier } = selection
    const highlightRef = useRef<HTMLDivElement | null>(null)

    // Scroll the highlighted plan into view on initial mount so emailed links
    // land the user directly on the card the email was pitching.
    useEffect(() => {
        if (!highlightedTier) return
        const node = highlightRef.current
        if (!node) return
        // Defer one frame so the grid has laid out.
        const id = requestAnimationFrame(() => {
            node.scrollIntoView({ behavior: "smooth", block: "center" })
        })
        // Drop the ring after 6 seconds so the page doesn't stay permanently "noisy".
        const timeout = window.setTimeout(() => {
            setSelection((current) => ({ ...current, highlightedTier: null }))
        }, 6000)
        return () => {
            cancelAnimationFrame(id)
            window.clearTimeout(timeout)
        }
    }, [highlightedTier])

    // If the user changes the product tab, drop the highlight — it no longer applies.
    const handleProductChange = (next: ProductType) => {
        setSelection({ product: next, highlightedTier: null })
    }

    const currentConfig = PRODUCT_CONFIG[product]
    const plans = currentConfig.plans

    return (
        <div className="py-24 md:py-32 bg-background">
            <div className="container mx-auto px-6 max-w-6xl">
                <div className="text-center space-y-6 mb-12">
                    <h1 className="text-5xl md:text-6xl font-serif font-medium tracking-tight text-primary">
                        Start free.<br />
                        <span className="italic">Upgrade when you outgrow it.</span>
                    </h1>
                    <p className="text-lg text-muted-foreground max-w-2xl mx-auto font-light leading-relaxed">
                        Email aliases plus end-to-end encrypted file drops. No trials, no upsell popups &mdash; Free is designed to be usable forever.
                    </p>
                </div>

                {/* Privacy trust row */}
                <PricingTrustRow />

                {/* Product Selector */}
                <Tabs value={product} onValueChange={(v) => handleProductChange(v as ProductType)} className="mb-12">
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
                    <div ref={highlightedTier === "free" ? highlightRef : null}>
                        <PricingPlanCard
                            plan={plans.free}
                            user={user}
                            isYearly={isYearly}
                            planId="free"
                            product={product}
                            currentPlanId={currentPlanId}
                            isHighlighted={highlightedTier === "free"}
                        />
                    </div>

                    {/* Plus Plan */}
                    <div ref={highlightedTier === "plus" ? highlightRef : null}>
                        <PricingPlanCard
                            plan={plans.plus}
                            user={user}
                            isYearly={isYearly}
                            planId="plus"
                            product={product}
                            currentPlanId={currentPlanId}
                            isPopular
                            isHighlighted={highlightedTier === "plus"}
                        />
                    </div>

                    {/* Pro Plan */}
                    <div ref={highlightedTier === "pro" ? highlightRef : null}>
                        <PricingPlanCard
                            plan={plans.pro}
                            user={user}
                            isYearly={isYearly}
                            planId="pro"
                            product={product}
                            currentPlanId={currentPlanId}
                            isDark
                            isHighlighted={highlightedTier === "pro"}
                        />
                    </div>
                </div>

                {/* FAQ Section */}
                <PricingFAQ />
            </div>
        </div>
    )
}
