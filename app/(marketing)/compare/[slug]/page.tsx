import { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Check, X, ArrowRight, ArrowLeft, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { comparisons, getComparison } from "@/config/comparisons"

interface PageProps {
    params: Promise<{
        slug: string
    }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const slug = (await params).slug
    const comparison = getComparison(slug)

    if (!comparison) {
        return {
            title: "Comparison Not Found",
        }
    }

    return {
        title: `${comparison.title} | Privacy Suite Comparison`,
        description: comparison.description,
    }
}

export async function generateStaticParams() {
    return comparisons.map((comparison) => ({
        slug: comparison.slug,
    }))
}

export default async function ComparisonPage({ params }: PageProps) {
    const slug = (await params).slug
    const comparison = getComparison(slug)

    if (!comparison) {
        notFound()
    }

    return (
        <section className="py-24 md:py-32">
            <div className="container mx-auto px-6 max-w-5xl">
                {/* Back Link */}
                <Link
                    href="/compare"
                    className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8"
                >
                    <ArrowLeft className="h-4 w-4" />
                    All Comparisons
                </Link>

                <div className="text-center mb-16">
                    <h1 className="text-4xl md:text-5xl font-serif font-medium tracking-tight text-primary mb-6">
                        {comparison.title}
                    </h1>
                    <p className="text-lg text-muted-foreground max-w-2xl mx-auto font-light leading-relaxed">
                        {comparison.description}
                    </p>
                </div>

                {/* Key Differences / Pros & Cons */}
                <div className="bg-primary/5 rounded-[2rem] p-8 md:p-12 mb-16">
                    <h2 className="text-2xl font-serif font-medium mb-6">Key Differences</h2>
                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <h3 className="font-medium text-green-600 dark:text-green-400">anon.li advantages:</h3>
                            <ul className="space-y-3 text-muted-foreground">
                                {comparison.anonliPros.map((pro, i) => (
                                    <li key={i} className="flex items-start gap-3">
                                        <Check className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                                        <span>{pro}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="space-y-4">
                            <h3 className="font-medium text-amber-600 dark:text-amber-400">{comparison.competitorName} advantages:</h3>
                            <ul className="space-y-3 text-muted-foreground">
                                {comparison.competitorPros.map((pro, i) => (
                                    <li key={i} className="flex items-start gap-3">
                                        <Check className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                                        <span>{pro}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Who Should Use What */}
                <div className="grid md:grid-cols-2 gap-6 mb-16">
                    <div className="bg-card rounded-[2rem] p-8 border border-primary/20">
                        <h3 className="text-xl font-serif font-medium mb-4 text-primary">Choose anon.li if you:</h3>
                        <ul className="space-y-3 text-muted-foreground">
                            {comparison.whoShouldUseData.anonLi.map((item, i) => (
                                <li key={i} className="flex items-start gap-2">
                                    <Check className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="bg-card rounded-[2rem] p-8 border border-border/50">
                        <h3 className="text-xl font-serif font-medium mb-4">Choose {comparison.competitorName} if you:</h3>
                        <ul className="space-y-3 text-muted-foreground">
                            {comparison.whoShouldUseData.competitor.map((item, i) => (
                                <li key={i} className="flex items-start gap-2">
                                    <Check className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                {/* Feature Comparison */}
                {comparison.comparisonData.features.map((section) => (
                    <div key={section.category} className="mb-12">
                        <h2 className="text-xl font-serif font-medium mb-6">{section.category}</h2>

                        {/* Desktop table */}
                        <div className="hidden md:block bg-card rounded-2xl border border-border/50 overflow-hidden">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-border/50">
                                        <th className="text-left p-4 font-medium text-muted-foreground">Feature</th>
                                        <th className="text-center p-4 font-medium text-primary">anon.li</th>
                                        <th className="text-center p-4 font-medium text-muted-foreground">{comparison.competitorName}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {section.items.map((item, i) => (
                                        <tr key={i} className="border-b border-border/50 last:border-0">
                                            <td className="p-4 text-muted-foreground">
                                                {item.feature}
                                                {item.source && (
                                                    <a href={item.source} target="_blank" rel="noopener noreferrer" className="inline-flex items-center ml-1.5 text-primary/50 hover:text-primary transition-colors" title={item.sourceLabel || "Source"}>
                                                        <ExternalLink className="h-3 w-3" />
                                                    </a>
                                                )}
                                            </td>
                                            <td className="p-4 text-center">
                                                <FeatureValue value={item.anonli} highlight />
                                            </td>
                                            <td className="p-4 text-center">
                                                <FeatureValue value={item.competitor} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile cards */}
                        <div className="md:hidden space-y-3">
                            {section.items.map((item, i) => (
                                <div key={i} className="bg-card rounded-xl border border-border/50 p-4">
                                    <p className="text-sm font-medium mb-3">{item.feature}</p>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="text-center p-2 rounded-lg bg-primary/5">
                                            <p className="text-xs text-primary font-medium mb-1">anon.li</p>
                                            <FeatureValue value={item.anonli} highlight />
                                        </div>
                                        <div className="text-center p-2 rounded-lg bg-secondary/50">
                                            <p className="text-xs text-muted-foreground font-medium mb-1">{comparison.competitorName}</p>
                                            <FeatureValue value={item.competitor} />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}

                {/* Pricing Comparison */}
                {comparison.comparisonData.pricing.length > 0 && (
                    <div className="mb-16">
                        <h2 className="text-xl font-serif font-medium mb-6">Pricing Comparison</h2>
                        <div className="bg-card rounded-2xl border border-border/50 overflow-hidden">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-border/50">
                                        <th className="text-left p-4 font-medium text-muted-foreground">What you get</th>
                                        <th className="text-center p-4 font-medium text-primary">anon.li</th>
                                        <th className="text-center p-4 font-medium text-muted-foreground">{comparison.competitorName}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {comparison.comparisonData.pricing.map((row, i) => (
                                        <tr key={i} className="border-b border-border/50 last:border-0">
                                            <td className="p-4 text-muted-foreground">{row.tier}</td>
                                            <td className="p-4 text-center font-medium">{row.anonli}</td>
                                            <td className="p-4 text-center text-muted-foreground">{row.competitor}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Sources */}
                <SourcesSection comparison={comparison} />

                {/* Bottom Line */}
                <div className="bg-secondary/30 rounded-[2rem] p-8 md:p-12 mb-12">
                    <h2 className="text-2xl font-serif font-medium mb-4">The Bottom Line</h2>
                    <p className="text-muted-foreground leading-relaxed mb-4">
                        {comparison.bottomLine}
                    </p>
                    <p className="text-xs text-muted-foreground/60">
                        Last verified: {new Date(comparison.lastVerified).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                        {" · "}
                        <a href={comparison.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-muted-foreground transition-colors">
                            {comparison.sourceName}
                        </a>
                    </p>
                </div>

                {/* CTA */}
                <div className="text-center">
                    <h3 className="text-xl font-medium mb-4">Try anon.li Free</h3>
                    <p className="text-muted-foreground mb-6">
                        No credit card required. Works with your existing email.
                    </p>
                    <div className="flex flex-wrap justify-center gap-4">
                        <Button asChild size="lg" className="rounded-full">
                            <Link href="/register">
                                Get Started Free
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Link>
                        </Button>
                        <Button asChild variant="outline" size="lg" className="rounded-full">
                            <Link href="/pricing">
                                View Pricing
                            </Link>
                        </Button>
                    </div>
                </div>
            </div>
        </section>
    )
}

function SourcesSection({ comparison }: { comparison: ReturnType<typeof getComparison> & {} }) {
    const allSources = new Map<string, string>()

    // Collect unique sources from all feature items
    for (const section of comparison.comparisonData.features) {
        for (const item of section.items) {
            if (item.source && item.sourceLabel) {
                allSources.set(item.source, item.sourceLabel)
            }
        }
    }

    // Always include the primary source
    allSources.set(comparison.sourceUrl, comparison.sourceName)

    if (allSources.size === 0) return null

    return (
        <div className="mb-12">
            <h2 className="text-xl font-serif font-medium mb-4">Sources</h2>
            <div className="bg-card rounded-2xl border border-border/50 p-6">
                <ul className="space-y-2 text-sm text-muted-foreground">
                    {Array.from(allSources.entries()).map(([url, label]) => (
                        <li key={url} className="flex items-center gap-2">
                            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-primary/50" />
                            <a href={url} target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors underline underline-offset-2">
                                {label}
                            </a>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    )
}

function FeatureValue({ value, highlight = false }: { value: boolean | string; highlight?: boolean }) {
    if (typeof value === "boolean") {
        return value ? (
            <Check className={`h-5 w-5 mx-auto ${highlight ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`} />
        ) : (
            <X className="h-5 w-5 mx-auto text-muted-foreground/40" />
        )
    }

    return (
        <span className={highlight ? "font-medium text-foreground" : "text-muted-foreground"}>
            {value}
        </span>
    )
}
