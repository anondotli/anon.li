"use client"

import Link from "next/link"
import { Building2, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CardRibbon } from "@/components/marketing/pricing/card-ribbon"
import { FeatureItem } from "@/components/marketing/feature-item"
import { BUSINESS_PLAN, ENTERPRISE_PLAN, BUSINESS_SEAT_PRICE } from "@/config/plans"
import { User } from "@/types/auth"

interface PricingTeamsSectionProps {
    user: User | null
    isYearly: boolean
}

/**
 * Teams (per-seat Business) + Enterprise (sales-led) pricing cards. These are
 * structurally different from the free/plus/pro PricingPlanCard — per-seat
 * pricing and a contact-sales path — so they live in their own section.
 */
export function PricingTeamsSection({ user, isYearly }: PricingTeamsSectionProps) {
    const seatMonthly = (isYearly ? BUSINESS_SEAT_PRICE.yearly / 12 : BUSINESS_SEAT_PRICE.monthly).toFixed(2)
    const businessCta = user ? "/dashboard/team" : "/register"

    return (
        <div id="teams" className="mb-24 max-w-5xl mx-auto scroll-mt-24">
            <div className="text-center space-y-3 mb-10">
                <h2 className="text-3xl md:text-4xl font-serif font-medium text-primary">Built for teams</h2>
                <p className="text-muted-foreground font-light max-w-2xl mx-auto leading-relaxed">
                    Share aliases, custom domains, and encrypted files across your organization — with
                    centralized billing, member management, and role-based access.
                </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 items-start">
                {/* Business — per seat */}
                <div className="rounded-[2rem] p-8 flex flex-col gap-6 bg-card border border-primary/20 relative overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-primary/5">
                    <CardRibbon label="Teams" />
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <Users className="h-5 w-5 text-primary" />
                            <h3 className="text-xl font-medium font-serif">{BUSINESS_PLAN.name}</h3>
                        </div>
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            <div className="flex items-baseline gap-1">
                                <span className="text-4xl font-serif font-normal">${seatMonthly}</span>
                                <span className="text-muted-foreground font-light text-sm">/seat/mo</span>
                            </div>
                            {isYearly && (
                                <span className="rounded-full mt-3 bg-secondary/70 px-3 py-1 text-xs font-medium text-muted-foreground">
                                    Billed ${BUSINESS_SEAT_PRICE.yearly}/seat/year
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-muted-foreground font-light">{BUSINESS_PLAN.description}</p>
                        <div className="h-px w-full my-2 bg-primary/10" />
                    </div>
                    <Button
                        asChild
                        className="w-full rounded-full h-10 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/10"
                    >
                        <Link href={businessCta}>{user ? "Create a team" : "Get started"}</Link>
                    </Button>
                    <ul className="space-y-3 text-sm text-muted-foreground">
                        {BUSINESS_PLAN.features.map((feature, i) => (
                            <FeatureItem key={i} included text={feature} />
                        ))}
                    </ul>
                </div>

                {/* Enterprise — sales-led */}
                <div className="rounded-[2rem] p-8 flex flex-col gap-6 bg-secondary relative overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-primary/5">
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <Building2 className="h-5 w-5" />
                            <h3 className="text-xl font-medium font-serif">{ENTERPRISE_PLAN.name}</h3>
                        </div>
                        <div className="flex items-baseline gap-1">
                            <span className="text-4xl font-serif font-normal">Custom</span>
                        </div>
                        <p className="text-sm text-muted-foreground font-light">{ENTERPRISE_PLAN.description}</p>
                        <div className="h-px w-full my-2 bg-border/50" />
                    </div>
                    <Button
                        asChild
                        variant="outline"
                        className="w-full rounded-full h-10 text-sm font-medium"
                    >
                        <Link href="mailto:hi@anon.li?subject=anon.li%20Enterprise">Contact sales</Link>
                    </Button>
                    <ul className="space-y-3 text-sm text-muted-foreground">
                        {ENTERPRISE_PLAN.features.map((feature, i) => (
                            <FeatureItem key={i} included text={feature} />
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    )
}
