"use client"

import { useMemo, useState } from "react"
import { ChevronDown } from "lucide-react"
import { PricingAction } from "@/components/marketing/pricing/action"
import { FeatureItem } from "@/components/marketing/feature-item"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { type PlanDefinition } from "@/config/plans"
import { User } from "@/types/auth"

// How many feature rows each section previews before the rest collapse behind
// the toggle. Bundle cards have several sections, so they preview fewer per
// section to keep every product (Alias/Drop/Form) visible without going tall.
const PREVIEW_PER_SECTION_MULTI = 2
const PREVIEW_PER_SECTION_SINGLE = 4

type ProductType = "bundle" | "alias" | "drop" | "form"

interface PricingPlanCardProps {
    plan: PlanDefinition
    user: User | null | undefined
    isYearly: boolean
    planId: string
    product: ProductType
    currentPlanId?: string | null
    isPopular?: boolean
    isDark?: boolean
    isHighlighted?: boolean
    onSubscribe?: (planId: string) => void
    dashboardLink?: string
}

export function PricingPlanCard({
    plan,
    user,
    isYearly,
    planId,
    product,
    currentPlanId,
    isPopular,
    isDark,
    isHighlighted,
    onSubscribe,
    dashboardLink = "/dashboard"
}: PricingPlanCardProps) {
    const isFree = planId === "free"
    const price = isFree ? "0" : formatPrice(isYearly ? plan.price.yearly / 12 : plan.price.monthly)
    const yearlyPrice = formatPrice(plan.price.yearly)
    const fullPlanId = `${product}_${planId}`
    // Real annual savings vs. paying monthly for a year — derived, never hardcoded,
    // so the displayed discount always matches the actual prices in config/plans.ts.
    const yearlySavingsPct = !isFree && plan.price.monthly > 0
        ? Math.round((1 - plan.price.yearly / (plan.price.monthly * 12)) * 100)
        : 0

    const cardClassName = `rounded-[2rem] p-8 flex flex-col gap-6 transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 relative overflow-hidden ${
        isHighlighted ? "ring-2 ring-primary ring-offset-4 ring-offset-background" : ""
    } ${
        isDark
            ? "bg-secondary"
            : isPopular
                ? "bg-card border border-primary/20"
                : "bg-card border border-border/50"
    }`

    const buttonClassName = `w-full rounded-full h-10 text-sm font-medium ${
        isPopular
            ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/10"
            : isDark
                ? "bg-secondary-foreground/10 hover:bg-secondary-foreground/20 text-secondary-foreground transition-all relative z-10"
                : ""
    }`

    const dividerClassName = `h-px w-full my-2 ${isPopular ? "bg-primary/10" : "bg-border/50"}`

    return (
        <div className={cardClassName}>
            {isPopular && (
                <div className="absolute top-0 right-0 bg-primary/10 text-primary text-xs font-medium px-3 py-1 rounded-bl-xl">
                    Popular
                </div>
            )}
            <div className={`space-y-4 ${isDark ? "relative z-10" : ""}`}>
                <h3 className="text-xl font-medium font-serif">{plan.name}</h3>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-serif font-normal">${price}</span>
                        {!isFree && (
                            <span className="text-muted-foreground font-light text-sm">/mo</span>
                        )}
                    </div>
                    {!isFree && isYearly && (
                        <span className="rounded-full bg-secondary/70 px-3 py-1 text-xs font-medium text-muted-foreground">
                            Billed ${yearlyPrice}/year
                            {yearlySavingsPct > 0 && (
                                <span className="ml-1 text-green-600 dark:text-green-500">· save {yearlySavingsPct}%</span>
                            )}
                        </span>
                    )}
                </div>
                <div className={dividerClassName} />
            </div>

            {/* Action Button */}
            {onSubscribe ? (
                // Product-specific pages use custom subscribe handler
                isFree ? (
                    <Button
                        asChild
                        variant="outline"
                        className="w-full rounded-full h-10 text-sm font-medium"
                    >
                        <Link href={user ? dashboardLink : "/register"}>
                            {user ? "Go to Dashboard" : "Get Started Free"}
                        </Link>
                    </Button>
                ) : (
                    <Button
                        onClick={() => onSubscribe(fullPlanId)}
                        className={buttonClassName}
                    >
                        {user ? `Upgrade to ${plan.name.split(' ').pop()}` : "Get Started"}
                    </Button>
                )
            ) : (
                // Main pricing page uses PricingAction component
                <PricingAction
                    user={user ?? null}
                    planId={fullPlanId}
                    isYearly={isYearly}
                    className={buttonClassName}
                    currentPlanId={currentPlanId ?? null}
                />
            )}

            <div className={`space-y-3 ${isDark ? "relative z-10" : ""}`}>
                <PlanFeatures plan={plan} planId={planId} isDark={isDark} />
            </div>
        </div>
    )
}

function formatPrice(price: number) {
    return price.toFixed(2)
}

interface PlanFeaturesProps {
    plan: PlanDefinition
    planId: string
    isDark?: boolean
}

interface NormalizedItem {
    text: string
    included: boolean
}

interface NormalizedSection {
    name: string
    items: NormalizedItem[]
}

/**
 * Flatten a plan's features (grouped bundle sections or a flat per-product list)
 * into a single shape so the preview/expand logic works the same either way.
 */
function normalizeSections(plan: PlanDefinition, planId: string): NormalizedSection[] {
    if (plan.featureSections) {
        return plan.featureSections.map((section) => ({
            name: section.name,
            items: [
                ...section.features.map((text) => ({ text, included: true })),
                ...(section.missingFeatures ?? []).map((text) => ({ text, included: false })),
            ],
        }))
    }

    const labelText = planId === "free"
        ? "Included"
        : planId === "plus"
            ? "Everything in Free, plus..."
            : "Everything in Plus, plus..."

    return [
        {
            name: labelText,
            items: [
                ...plan.features.map((text) => ({ text, included: true })),
                ...(plan.missingFeatures ?? []).map((text) => ({ text, included: false })),
            ],
        },
    ]
}

function PlanFeatures({ plan, planId, isDark }: PlanFeaturesProps) {
    const [expanded, setExpanded] = useState(false)

    const sections = useMemo(() => normalizeSections(plan, planId), [plan, planId])
    const totalItems = sections.reduce((count, section) => count + section.items.length, 0)
    const previewPerSection = sections.length > 1 ? PREVIEW_PER_SECTION_MULTI : PREVIEW_PER_SECTION_SINGLE
    const previewCount = sections.reduce((count, section) => count + Math.min(section.items.length, previewPerSection), 0)
    const hiddenCount = totalItems - previewCount
    // Only collapse when it meaningfully shortens the card (at least 2 rows hidden).
    const collapsible = hiddenCount >= 2
    // When not collapsible, every item is part of the always-visible preview.
    const perSection = collapsible ? previewPerSection : Infinity

    return (
        <div className="space-y-4">
            {sections.map((section, idx) => {
                const preview = section.items.slice(0, perSection)
                const rest = section.items.slice(perSection)
                return (
                    <div key={idx} className="space-y-3">
                        <p className="font-medium text-xs uppercase tracking-wider text-muted-foreground">
                            {section.name}
                        </p>
                        <ul className="space-y-3 text-sm text-muted-foreground">
                            {preview.map((item, i) => (
                                <FeatureItem key={i} included={item.included} text={item.text} />
                            ))}
                        </ul>
                        {/* Remaining rows stay mounted and reveal via a grid-rows
                            transition, so toggling never adds/removes DOM nodes
                            (which is what made the page jump). */}
                        {rest.length > 0 && (
                            <div
                                className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                                    expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                                }`}
                            >
                                <ul className="space-y-3 overflow-hidden pt-3 text-sm text-muted-foreground">
                                    {rest.map((item, i) => (
                                        <FeatureItem key={i} included={item.included} text={item.text} />
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )
            })}

            {collapsible && (
                <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    aria-expanded={expanded}
                    className={`inline-flex items-center gap-1.5 text-sm font-medium transition-colors ${
                        isDark
                            ? "text-secondary-foreground/70 hover:text-secondary-foreground"
                            : "text-primary/80 hover:text-primary"
                    }`}
                >
                    {expanded ? "Show less" : `Show all ${totalItems} features`}
                    <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
                </button>
            )}
        </div>
    )
}
