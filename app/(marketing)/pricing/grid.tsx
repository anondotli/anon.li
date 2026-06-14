"use client"

import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Mail, FileUp, ClipboardList, ChevronDown } from "lucide-react"
import { PricingToggle } from "@/components/marketing/pricing/toggle"
import { BUNDLE_PLANS, ALIAS_PLANS, DROP_PLANS, FORM_PLANS, type PlanDefinition } from "@/config/plans"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PricingFAQ } from "@/components/marketing/pricing/faq"
import { PricingPlanCard } from "@/components/marketing/pricing/plan-card"
import { PricingTeamsSection } from "@/components/marketing/pricing/teams-section"
import { PricingTrustRow } from "@/components/marketing/pricing/trust-row"

import { User } from "@/types/auth"

interface PricingGridProps {
    user: User | null
    currentPlanId: string | null
}

type ProductType = "bundle" | "alias" | "drop" | "form"
type IndividualProduct = "alias" | "drop" | "form"
type PlanTier = "free" | "plus" | "pro"

type PlanSet = Record<PlanTier, PlanDefinition>

// Individual (single-product) plans live behind a disclosure. The bundle is the
// headline offer because the billing system only allows one active subscription
// per user (see actions/create-checkout-session.ts) — mixing per-product subs
// isn't actually possible, so leading with the bundle matches how billing works.
const INDIVIDUAL_CONFIG: Record<IndividualProduct, { name: string; description: string; icon: typeof Mail; plans: PlanSet }> = {
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
    form: {
        name: "Form",
        description: "End-to-end encrypted forms for confidential intake",
        icon: ClipboardList,
        plans: FORM_PLANS,
    },
}

function parseHighlight(raw: string | null): { product: ProductType; tier: PlanTier } | null {
    if (!raw) return null
    const [p, t] = raw.split("_")
    const productOk = p === "bundle" || p === "alias" || p === "drop" || p === "form"
    const tierOk = t === "plus" || t === "pro" || t === "free"
    if (!productOk || !tierOk) return null
    return { product: p as ProductType, tier: t as PlanTier }
}

const TIER_ROW: { id: PlanTier; isPopular?: boolean; isDark?: boolean }[] = [
    { id: "free" },
    { id: "plus", isPopular: true },
    { id: "pro", isDark: true },
]

export function PricingGrid({ user, currentPlanId }: PricingGridProps) {
    const searchParams = useSearchParams()
    const [isYearly, setIsYearly] = useState(true)

    // `?highlight=<product>_<tier>` (from upgrade dialogs and growth emails) takes
    // precedence, then the legacy `?alias` / `?drop` / `?form` presence flags from
    // product marketing pages. Anything pointing at a single product opens the
    // individual-plans disclosure and pre-selects that product.
    const initial = (() => {
        const parsed = parseHighlight(searchParams.get("highlight"))
        if (parsed) return { product: parsed.product, tier: parsed.tier }
        if (searchParams.has("alias")) return { product: "alias" as const, tier: null }
        if (searchParams.has("drop")) return { product: "drop" as const, tier: null }
        if (searchParams.has("form")) return { product: "form" as const, tier: null }
        return { product: "bundle" as const, tier: null }
    })()

    const wantsIndividual = initial.product !== "bundle"
    const [showIndividual, setShowIndividual] = useState(wantsIndividual)
    const [individualProduct, setIndividualProduct] = useState<IndividualProduct>(
        wantsIndividual ? (initial.product as IndividualProduct) : "alias"
    )
    const [highlightedTier, setHighlightedTier] = useState<PlanTier | null>(initial.tier)

    const highlightRef = useRef<HTMLDivElement | null>(null)
    const individualRef = useRef<HTMLDivElement | null>(null)

    // On mount, scroll the highlighted card (or the opened individual section) into
    // view so emailed/deep links land directly on the card they were pitching.
    useEffect(() => {
        if (!highlightedTier && !wantsIndividual) return
        const node = highlightRef.current ?? individualRef.current
        if (!node) return
        const frame = requestAnimationFrame(() => {
            node.scrollIntoView({ behavior: "smooth", block: "center" })
        })
        // Drop the ring after 6s so the page doesn't stay permanently "noisy".
        const timeout = window.setTimeout(() => setHighlightedTier(null), 6000)
        return () => {
            cancelAnimationFrame(frame)
            window.clearTimeout(timeout)
        }
        // Mount-only: deep-link intent is read once.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleIndividualChange = (next: IndividualProduct) => {
        setIndividualProduct(next)
        setHighlightedTier(null)
    }

    // Only the targeted product shows the highlight ring + owns the scroll ref.
    const highlightProduct: ProductType = wantsIndividual ? individualProduct : "bundle"

    const renderRow = (plans: PlanSet, product: ProductType) => {
        const tierForRow = highlightProduct === product ? highlightedTier : null
        return (
            <div className="grid md:grid-cols-3 gap-8 items-start max-w-7xl mx-auto">
                {TIER_ROW.map(({ id, isPopular, isDark }) => (
                    <div key={id} ref={tierForRow === id ? highlightRef : null}>
                        <PricingPlanCard
                            plan={plans[id]}
                            user={user}
                            isYearly={isYearly}
                            planId={id}
                            product={product}
                            currentPlanId={currentPlanId}
                            isPopular={isPopular}
                            isDark={isDark}
                            isHighlighted={tierForRow === id}
                        />
                    </div>
                ))}
            </div>
        )
    }

    return (
        <div className="py-24 md:py-32 bg-background">
            <div className="container mx-auto px-6 max-w-6xl">
                <div className="text-center space-y-6 mb-12">
                    <h1 className="text-5xl md:text-6xl font-serif font-medium tracking-tight text-primary">
                        Start free.<br />
                        <span className="italic">Upgrade when you outgrow it.</span>
                    </h1>
                    <p className="text-lg text-muted-foreground max-w-2xl mx-auto font-light leading-relaxed">
                        One plan for everything: email aliases, end-to-end encrypted file drops, and confidential forms. No trials, no upsell popups — Free is designed to be usable forever.
                    </p>
                </div>

                {/* Billing Toggle */}
                <div className="flex justify-center mb-12">
                    <PricingToggle isYearly={isYearly} onToggle={setIsYearly} />
                </div>

                {/* Bundle — the headline offer */}
                <div className="mb-10">
                    {renderRow(BUNDLE_PLANS, "bundle")}
                </div>

                {/* Individual products — quiet secondary path */}
                <div ref={individualRef} className="mb-24 max-w-7xl mx-auto">
                    <div className="flex justify-center">
                        <button
                            type="button"
                            onClick={() => setShowIndividual((v) => !v)}
                            aria-expanded={showIndividual}
                            className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-secondary/30 px-5 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:border-primary/20"
                        >
                            Only need one product? Compare Alias, Drop &amp; Form plans
                            <ChevronDown className={`h-4 w-4 transition-transform ${showIndividual ? "rotate-180" : ""}`} />
                        </button>
                    </div>

                    {showIndividual && (
                        <div className="mt-10 space-y-8">
                            <Tabs value={individualProduct} onValueChange={(v) => handleIndividualChange(v as IndividualProduct)}>
                                <TabsList className="grid w-full max-w-md mx-auto grid-cols-3 h-auto p-1.5 bg-secondary/50 rounded-2xl">
                                    {(Object.keys(INDIVIDUAL_CONFIG) as IndividualProduct[]).map((key) => {
                                        const config = INDIVIDUAL_CONFIG[key]
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

                            <p className="text-center text-muted-foreground font-light">
                                {INDIVIDUAL_CONFIG[individualProduct].description}
                            </p>

                            {renderRow(INDIVIDUAL_CONFIG[individualProduct].plans, individualProduct)}
                        </div>
                    )}
                </div>

                {/* Teams & Enterprise */}
                <PricingTeamsSection user={user} isYearly={isYearly} />

                {/* Privacy trust row */}
                <PricingTrustRow />

                {/* FAQ Section */}
                <PricingFAQ />
            </div>
        </div>
    )
}
