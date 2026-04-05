import { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Shield, Zap, DollarSign } from "lucide-react"
import { comparisons } from "@/config/comparisons"

export const metadata: Metadata = {
    title: "Compare anon.li to Alternatives | Privacy Tools Comparison",
    description: "See how anon.li compares to SimpleLogin, Proton, and other privacy tools. Feature-by-feature comparison of email aliases and encrypted file sharing.",
}

export default function ComparePage() {
    return (
        <>
            <section className="py-24 md:py-32">
                <div className="container mx-auto px-6 max-w-5xl">
                    <div className="text-center mb-16">
                        <h1 className="text-4xl md:text-5xl font-serif font-medium tracking-tight text-primary mb-6">
                            How anon.li Compares
                        </h1>
                        <p className="text-lg text-muted-foreground max-w-2xl mx-auto font-light leading-relaxed">
                            We believe in transparency. See how anon.li stacks up against other privacy tools
                            so you can make an informed decision.
                        </p>
                    </div>

                    {/* Why Compare */}
                    <div className="grid md:grid-cols-3 gap-6 mb-16">
                        <div className="bg-card rounded-2xl p-6 border border-border/50">
                            <Shield className="h-8 w-8 text-primary mb-4" />
                            <h3 className="font-medium mb-2">Privacy First</h3>
                            <p className="text-sm text-muted-foreground">
                                End-to-end encrypted file sharing with privacy-focused email forwarding.
                            </p>
                        </div>
                        <div className="bg-card rounded-2xl p-6 border border-border/50">
                            <DollarSign className="h-8 w-8 text-primary mb-4" />
                            <h3 className="font-medium mb-2">Fair Pricing</h3>
                            <p className="text-sm text-muted-foreground">
                                More features on free tier. PGP encryption included at no extra cost.
                            </p>
                        </div>
                        <div className="bg-card rounded-2xl p-6 border border-border/50">
                            <Zap className="h-8 w-8 text-primary mb-4" />
                            <h3 className="font-medium mb-2">All-in-One</h3>
                            <p className="text-sm text-muted-foreground">
                                Email aliases and encrypted file sharing in one simple platform.
                            </p>
                        </div>
                    </div>

                    {/* Comparison Cards */}
                    <div className="space-y-6">
                        <h2 className="text-2xl font-serif font-medium mb-6">Detailed Comparisons</h2>

                        {comparisons.map((comparison) => (
                            <Link
                                key={comparison.slug}
                                href={`/compare/${comparison.slug}`}
                                className="block group"
                            >
                                <div className="bg-card rounded-[2rem] p-8 border border-border/50 hover:border-primary/20 transition-all duration-300 hover:shadow-xl hover:shadow-primary/5">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                        <div>
                                            <h3 className="text-xl font-medium mb-2 group-hover:text-primary transition-colors">
                                                anon.li vs {comparison.competitorName}
                                            </h3>
                                            <p className="text-muted-foreground mb-4">
                                                {comparison.description}
                                            </p>
                                            <ul className="flex flex-wrap gap-2">
                                                {comparison.anonliPros.slice(0, 3).map((highlight, i) => (
                                                    <li
                                                        key={i}
                                                        className="text-xs px-3 py-1 rounded-full bg-primary/10 text-primary"
                                                    >
                                                        {highlight}
                                                    </li>
                                                ))}
                                            </ul>
                                            <p className="text-xs text-muted-foreground/60 mt-3">
                                                Last verified: {new Date(comparison.lastVerified).toLocaleDateString("en-US", { year: "numeric", month: "short" })}
                                            </p>
                                        </div>
                                        <ArrowRight className="h-6 w-6 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all shrink-0" />
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>

                    {/* Bottom CTA */}
                    <div className="mt-16 text-center">
                        <p className="text-muted-foreground mb-4">
                            Ready to try anon.li? Start free - no credit card required.
                        </p>
                        <Link
                            href="/register"
                            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-full font-medium hover:bg-primary/90 transition-colors"
                        >
                            Get Started Free
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </div>
                </div>
            </section>
        </>
    )
}
