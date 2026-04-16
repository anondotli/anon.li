import Link from "next/link"
import { Metadata } from "next"
import { Button } from "@/components/ui/button"
import { ArrowRight, Mail, Key, Globe, Zap, Lock, EyeOff, HelpCircle, MessageSquareReply, Ban, Tag } from "lucide-react"
import { HomeCTA } from "@/components/marketing/home-cta"
import { auth } from "@/auth"
import { FeatureCard } from "@/components/marketing/feature-card"
import { StepCard } from "@/components/marketing/step-card"
import { InteractiveDotGrid } from "@/components/marketing/dot-grid"
import { TrustIndicatorBar } from "@/components/marketing/trust-indicator-bar"

import { siteConfig } from "@/config/site"
import { getCspNonce } from "@/lib/csp"

export const metadata: Metadata = {
    title: siteConfig.alias.metadata?.title,
    description: siteConfig.alias.description,
    openGraph: {
        title: siteConfig.alias.metadata?.title as string,
        description: siteConfig.alias.description,
        url: siteConfig.alias.url,
    },
    alternates: {
        canonical: siteConfig.alias.url,
    }
}

export default async function AliasLandingPage() {
    const session = await auth()
    const nonce = await getCspNonce()

    return (
        <>
            <section className="relative w-full py-12 md:py-20 lg:py-24 flex items-center justify-center min-h-[80vh] overflow-hidden">
                {/* Background */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    <InteractiveDotGrid />

                    {/* Subtle Glow Accents */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/10 opacity-50 blur-[80px] rounded-full pointer-events-none" />
                    <div className="absolute bottom-0 right-0 w-[400px] h-[300px] bg-secondary/10 opacity-30 blur-[60px] rounded-full pointer-events-none" />
                </div>

                <div className="container mx-auto px-6 relative z-10 w-full">
                    <div className="flex flex-col items-center space-y-5 text-center">

                        <Link href="/about" className="inline-flex items-center rounded-full border border-primary/10 bg-background px-4 py-1.5 text-sm font-medium animate-in fade-in slide-in-from-bottom-4 hover:scale-105 duration-700">
                            <span className="flex h-2 w-2 rounded-full bg-primary mr-2 animate-pulse"></span>
                            <span className="text-primary/80 tracking-wide font-serif">Open Source & Private</span>
                        </Link>

                        <div className="space-y-6 max-w-5xl mx-auto w-full">
                            <h1 className="text-4xl font-medium tracking-tight sm:text-5xl md:text-6xl lg:text-7xl font-serif text-primary animate-in fade-in slide-in-from-bottom-6 duration-1000 fill-mode-both delay-100">
                                Your Real Identity.<br className="hidden md:block" />
                                <span className="italic text-muted-foreground">Protected Forever.</span>
                            </h1>
                            <p className="mx-auto max-w-2xl text-muted-foreground md:text-lg lg:text-xl leading-relaxed font-light animate-in fade-in slide-in-from-bottom-6 duration-1000 fill-mode-both delay-200">
                                Create private email aliases, forward to your real inbox, and reply safely without exposing your real address.
                            </p>
                        </div>

                        <div className="flex flex-row gap-3 sm:gap-4 w-full sm:w-auto justify-center animate-in fade-in slide-in-from-bottom-6 duration-1000 fill-mode-both delay-300 pt-6 px-4 sm:px-0">
                            <HomeCTA user={session?.user} size="lg" className="flex-1 sm:flex-none w-auto rounded-full px-4 sm:px-6 text-sm sm:text-base font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-200 shadow-lg shadow-primary/10 whitespace-nowrap">
                                {session?.user ? "Go to Dashboard" : "Start for Free"} {!session?.user && <ArrowRight className="ml-2 h-4 w-4" />}
                            </HomeCTA>
                            <Button variant="outline" size="lg" asChild className="flex-1 sm:flex-none w-auto rounded-full px-4 sm:px-6 text-sm sm:text-base border-primary/20 bg-background font-medium transition-colors whitespace-nowrap">
                                <Link href="#how-it-works">How it works <HelpCircle className="ml-2 h-4 w-4 text-muted-foreground"/></Link>
                            </Button>
                        </div>

                        <div className="pt-10 animate-in fade-in duration-1000 delay-500">
                            <TrustIndicatorBar product="alias" />
                        </div>

                    </div>
                </div>
            </section>

            <section id="features" className="w-full py-20 bg-secondary/30 relative">
                <div className="container mx-auto px-6 relative z-10">
                    <div className="text-center mb-14 space-y-4">
                        <h2 className="text-3xl md:text-4xl font-serif font-medium tracking-tight">Your inbox, your rules</h2>
                        <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto font-light">
                            Everything you need to keep your real email hidden from the world.
                        </p>
                    </div>
                    <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto">
                        <FeatureCard
                            icon={<Mail className="h-6 w-6" />}
                            title="Private Aliases"
                            description="Generate a new address for every site. Keep your real email private and harder to correlate across services."
                        />
                        <FeatureCard
                            icon={<MessageSquareReply className="h-6 w-6" />}
                            title="Reply with Alias"
                            description="Reply to any forwarded email privately using your alias, so your real email is never exposed."
                        />
                        <FeatureCard
                            icon={<Key className="h-6 w-6" />}
                            title="PGP Encryption"
                            description="Add a PGP key to a verified recipient and we&apos;ll encrypt forwarded copies before delivery. Standard forwarding still requires transient server-side processing."
                        />
                        <FeatureCard
                            icon={<Globe className="h-6 w-6" />}
                            title="Custom Domains"
                            description="Bring your own domain with DKIM signing for professional aliases like contact@brand.com."
                        />
                        <FeatureCard
                            icon={<Ban className="h-6 w-6" />}
                            title="Instant Spam Control"
                            description="Disable any alias with one click to stop receiving emails. No more dealing with unsubscribe links."
                        />
                        <FeatureCard
                            icon={<Tag className="h-6 w-6" />}
                            title="Labels, Notes & Stats"
                            description="Organize aliases by purpose with custom labels. Track emails received, blocked, and last activity."
                        />
                    </div>
                </div>
            </section>

            <section id="how-it-works" className="py-20 bg-background border-t border-border/40">
                <div className="container mx-auto px-6">
                    <div className="text-center mb-14 space-y-4">
                        <h2 className="text-3xl md:text-4xl font-serif font-medium tracking-tight">How it works</h2>
                        <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto font-light">
                            Three simple steps to regain your privacy.
                        </p>
                    </div>

                    <div className="grid gap-16 md:grid-cols-3 relative">
                        {/* Line decoration */}
                        <div className="hidden md:block absolute top-8 left-[20%] right-[20%] h-px bg-border z-0" />

                        <StepCard
                            number="1"
                            icon={<Zap className="h-6 w-6" />}
                            title="Create an Alias"
                            description="Generate a random or custom alias (e.g. alias@anon.li) in one click."
                        />
                        <StepCard
                            number="2"
                            icon={<EyeOff className="h-6 w-6" />}
                            title="Use it Online"
                            description="Use this alias when signing up for newsletters, apps, or shopping online."
                        />
                        <StepCard
                            number="3"
                            icon={<Lock className="h-6 w-6" />}
                            title="Stay Private"
                            description="We forward emails to your real inbox. Reply directly from your alias while keeping your real address hidden."
                        />
                    </div>
                </div>
            </section>

            {/* API Section */}
            <section className="py-20 bg-secondary/20">
                <div className="container mx-auto px-6">
                    <div className="grid md:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
                        <div className="space-y-6">
                            <h2 className="text-3xl md:text-4xl font-serif font-medium tracking-tight">
                                Automate with our API
                            </h2>
                            <p className="text-base md:text-lg text-muted-foreground font-light leading-relaxed">
                                Create aliases programmatically for your apps. Our REST API makes it easy to integrate privacy features into your workflow.
                            </p>
                            <div className="flex gap-4">
                                <Button asChild className="rounded-full">
                                    <Link href="/docs/api">API Documentation</Link>
                                </Button>
                                <Button variant="outline" asChild className="rounded-full">
                                    <Link href="/dashboard/api-keys">Get API Key</Link>
                                </Button>
                            </div>
                        </div>
                        <div className="bg-background rounded-2xl p-6 border border-border/50 font-mono text-sm overflow-x-auto">
                            <pre className="text-muted-foreground">
                                {`curl -X POST https://anon.li/api/v1/alias \\
  -H "Authorization: Bearer API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "format": "random_characters",
    "domain": "anon.li"
  }'`}
                            </pre>
                        </div>
                    </div>
                </div>
            </section>

            <section className="py-20 bg-background">
                <div className="container mx-auto px-6">
                    <div className="relative rounded-2xl overflow-hidden bg-primary text-primary-foreground px-6 py-16 md:px-16 md:py-20 text-center shadow-2xl">
                        {/* Texture */}
                        <div className="absolute inset-0 opacity-5 bg-[url('/noise.svg')] mix-blend-overlay"></div>

                        <div className="relative z-10 space-y-6 max-w-3xl mx-auto">
                            <h2 className="text-3xl md:text-4xl lg:text-5xl font-serif font-medium tracking-tight leading-tight">
                                Ready to stop tracking pixels?
                            </h2>
                            <p className="text-lg opacity-90 font-light max-w-2xl mx-auto">
                                Reclaim your privacy today. Free to get started.
                            </p>
                            <div className="flex justify-center pt-4 gap-3">
                                <HomeCTA user={session?.user} size="lg" variant="secondary" className="rounded-full px-8 bg-background text-foreground hover:bg-secondary transition-colors border-none font-medium">
                                    {session?.user ? "Go to Dashboard" : "Get Started for Free"}
                                </HomeCTA>
                                <Button asChild size="lg" variant="ghost" className="rounded-full px-8 text-foreground bg-background/80 hover:bg-secondary/70 font-medium">
                                    <Link href="/pricing?alias">
                                        View Pricing
                                    </Link>
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <script
                nonce={nonce}
                suppressHydrationWarning
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                        "@context": "https://schema.org",
                        "@type": "SoftwareApplication",
                        "name": "Anon.li Email Aliases",
                        "applicationCategory": "PrivacySecurityApplication",
                        "operatingSystem": "Web",
                        "offers": {
                            "@type": "Offer",
                            "price": "0",
                            "priceCurrency": "USD"
                        },
                        "description": "Protect your identity with private email aliases."
                    })
                }}
            />
        </>
    )
}
