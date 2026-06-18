import Link from "next/link"
import { cn } from "@/lib/utils"
import { LazyDotGrid } from "./lazy-dot-grid"
import { HeroAuthCta } from "./auth-aware-cta"
import { HeroTrustBar } from "./hero-trust-bar"
import { HERO_TRUST_INDICATORS } from "@/config/claims"

export function HeroSection() {
    return (
        <section className="relative w-full py-12 md:py-20 lg:py-24 flex items-center justify-center min-h-[80vh] overflow-hidden">
            <HeroBackground />

            <div className="container mx-auto px-6 relative z-10 w-full">
                <div className="flex flex-col items-center space-y-5 text-center">
                    <HeroBadge />

                    <div className="space-y-6 max-w-5xl mx-auto w-full">
                        <FadeIn delay={100}>
                            <h1 className="text-4xl font-medium tracking-tight sm:text-5xl md:text-6xl lg:text-7xl font-serif text-primary">
                                Privacy by Default.<br className="hidden md:block" />
                                <span className="italic text-muted-foreground">Not by Request.</span>
                            </h1>
                        </FadeIn>

                        <FadeIn delay={200}>
                            <p className="mx-auto max-w-2xl text-muted-foreground md:text-lg lg:text-xl leading-relaxed font-light">
                                Anonymous email aliases, end-to-end encrypted file sharing, and confidential forms. We can&apos;t read any of it - by design, not by policy.
                            </p>
                        </FadeIn>
                    </div>

                    <FadeIn delay={300} className="w-full sm:w-auto pt-6 px-4 sm:px-0">
                        <HeroAuthCta />
                    </FadeIn>

                    <FadeIn delay={500} className="pt-10">
                        <TrustIndicators />
                    </FadeIn>
                </div>
            </div>
        </section>
    )
}

function HeroBackground() {
    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {/* Interactive Dot Pattern - dots brighten based on mouse proximity */}
            <LazyDotGrid />

            {/* Ambient Lighting */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/10 opacity-50 blur-[80px] rounded-full pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-[400px] h-[300px] bg-secondary/10 opacity-30 blur-[60px] rounded-full pointer-events-none" />
        </div>
    )
}

function HeroBadge() {
    return (
        <Link href="/blog/introduction" className="inline-flex items-center rounded-full border border-primary/10 bg-background px-4 py-1.5 text-sm font-medium animate-in fade-in slide-in-from-bottom-4 duration-700 hover:scale-105 transition-transform">
            <span className="flex h-2 w-2 rounded-full bg-primary mr-2 animate-pulse"></span>
            <span className="text-primary/80 tracking-wide">Introducing anon.li</span>
        </Link>
    )
}

function TrustIndicators() {
    return (
        <HeroTrustBar
            items={HERO_TRUST_INDICATORS.map((item) => ({ label: item.label, href: "/security" }))}
        />
    )
}

function FadeIn({
    children,
    delay = 0,
    className
}: {
    children: React.ReactNode
    delay?: number
    className?: string
}) {
    // We utilize a standard fade-in animation with configurable delay
    // This helps manage visual hierarchy without complex orchestration libraries
    return (
        <div
            className={cn(
                "animate-in fade-in slide-in-from-bottom-6 duration-1000 fill-mode-both",
                className
            )}
            style={{ animationDelay: `${delay}ms` }}
        >
            {children}
        </div>
    )
}
