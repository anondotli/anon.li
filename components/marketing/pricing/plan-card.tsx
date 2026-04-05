"use client"

import { PricingAction } from "@/components/marketing/pricing/action"
import { FeatureItem } from "@/components/marketing/feature-item"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { type PlanDefinition } from "@/config/plans"
import { User } from "@/types/auth"

type ProductType = "bundle" | "alias" | "drop"

interface PricingPlanCardProps {
    plan: PlanDefinition
    user: User | null | undefined
    isYearly: boolean
    planId: string
    product: ProductType
    currentPlanId?: string | null
    isPopular?: boolean
    isDark?: boolean
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
    onSubscribe,
    dashboardLink = "/dashboard"
}: PricingPlanCardProps) {
    const isFree = planId === "free"
    const price = isFree ? 0 : (isYearly ? (plan.price.yearly / 12).toFixed(2) : plan.price.monthly)
    const fullPlanId = `${product}_${planId}`

    const cardClassName = `rounded-[2rem] p-8 flex flex-col gap-6 transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 relative overflow-hidden ${
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
                <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-serif font-normal">${price}</span>
                    {!isFree && (
                        <span className="text-muted-foreground font-light text-sm">/mo</span>
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
                <PlanFeatures plan={plan} planId={planId} />
            </div>
        </div>
    )
}

interface PlanFeaturesProps {
    plan: PlanDefinition
    planId: string
}

function PlanFeatures({ plan, planId }: PlanFeaturesProps) {
    if (plan.featureSections) {
        return (
            <div className="space-y-6">
                {plan.featureSections.map((section, idx) => (
                    <div key={idx} className="space-y-3">
                        <p className="font-medium text-xs uppercase tracking-wider text-muted-foreground">
                            {section.name}
                        </p>
                        <ul className="space-y-3 text-sm text-muted-foreground">
                            {section.features.map((feature, i) => (
                                <FeatureItem key={i} included={true} text={feature} />
                            ))}
                            {section.missingFeatures?.map((feature, i) => (
                                <FeatureItem key={`missing-${i}`} included={false} text={feature} />
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        )
    }

    const labelText = planId === "free" 
        ? "Included" 
        : planId === "plus" 
            ? "Everything in Free, plus..." 
            : "Everything in Plus, plus..."

    return (
        <>
            <p className="font-medium text-xs uppercase tracking-wider text-muted-foreground">
                {labelText}
            </p>
            <ul className="space-y-3 text-sm text-muted-foreground">
                {plan.features.map((feature, i) => (
                    <FeatureItem key={i} included={true} text={feature} />
                ))}
                {plan.missingFeatures?.map((feature, i) => (
                    <FeatureItem key={`missing-${i}`} included={false} text={feature} />
                ))}
            </ul>
        </>
    )
}