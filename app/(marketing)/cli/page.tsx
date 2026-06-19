import Link from "next/link"
import { Metadata } from "next"
import { Button } from "@/components/ui/button"
import { Terminal, Download, Mail, Lock, Key, Globe } from "lucide-react"
import { FeatureCard } from "@/components/marketing/feature-card"
import { StepCard } from "@/components/marketing/step-card"
import { PageHero } from "@/components/marketing/page-hero"
import { MarketingBadge } from "@/components/marketing/marketing-badge"
import { CtaBanner } from "@/components/marketing/cta-banner"
import { HeroTrustBar } from "@/components/marketing/hero-trust-bar"
import { InstallCommands } from "./install-commands"

export const metadata: Metadata = {
    title: "CLI",
    description: "Manage private email aliases and encrypted file drops from your terminal. Cross-platform, open source, end-to-end encrypted.",
    openGraph: {
        title: "anon.li CLI - Command-Line Privacy Tools",
        description: "Manage private email aliases and encrypted file drops from your terminal. Cross-platform, open source, end-to-end encrypted.",
        url: "https://anon.li/cli",
    },
    alternates: {
        canonical: "https://anon.li/cli",
    },
}

export default function CliPage() {
    return (
        <>
            {/* Hero */}
            <div id="hero">
                <PageHero
                    background="left"
                    badge={<MarketingBadge href="https://github.com/anondotli/cli">Open Source CLI</MarketingBadge>}
                    title="Aliases and encrypted drops, from your terminal."
                    subtitle="Manage private email aliases and share encrypted files - all from the command line. Fast, scriptable & open source."
                >
                    <InstallCommands />
                    <div className="pt-10">
                        <HeroTrustBar
                            items={[
                                { label: "Cross-Platform" },
                                { label: "Open Source" },
                                { label: "E2E Encrypted" },
                            ]}
                        />
                    </div>
                </PageHero>
            </div>

            {/* Features */}
            <section className="w-full py-20 bg-background border-t border-border/40">
                <div className="container mx-auto px-6 relative z-10">
                    <div className="text-center mb-14 space-y-4">
                        <h2 className="text-3xl md:text-4xl font-serif font-medium tracking-tight">What the CLI does</h2>
                        <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto font-light">
                            Aliases, drops, recipients, and domains — scriptable from one binary.
                        </p>
                    </div>

                    <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4 max-w-6xl mx-auto">
                        <FeatureCard
                            icon={<Lock className="h-6 w-6" />}
                            title="Encrypted Drops"
                            description="Upload and share files with client-side AES-256-GCM encryption. Keys never leave your machine."
                        />
                        <FeatureCard
                            icon={<Mail className="h-6 w-6" />}
                            title="Email Aliases"
                            description="Create, list, and manage private email aliases. Forward to your real inbox without exposing it."
                        />
                        <FeatureCard
                            icon={<Globe className="h-6 w-6" />}
                            title="Cross-Platform"
                            description="Works on macOS, Linux, and Windows. Install via npm, bun, or our one-line scripts."
                        />
                        <FeatureCard
                            icon={<Key className="h-6 w-6" />}
                            title="API Keys & Domains"
                            description="Manage custom domains and automate privacy workflows from the terminal. API keys are created and revoked from your dashboard."
                        />
                    </div>
                </div>
            </section>

            {/* Commands Showcase */}
            <section className="w-full py-20 bg-secondary/20">
                <div className="container mx-auto px-6">
                    <div className="grid gap-16 lg:grid-cols-2 items-center">
                        <div className="space-y-6">
                            <h2 className="text-3xl md:text-4xl font-serif font-medium tracking-tight">Powerful commands,<br />simple syntax</h2>
                            <p className="text-base md:text-lg text-muted-foreground font-light leading-relaxed max-w-xl">
                                Manage aliases, domains, drops, and recipients from the command line. Authenticate once, then create aliases, upload encrypted files, and manage your account - all without leaving the terminal.
                            </p>
                        </div>

                        <div className="rounded-2xl bg-background border border-border/60 p-8 font-mono text-sm leading-loose overflow-x-auto shadow-lg">
                            <div className="space-y-1">
                                <div><span className="text-muted-foreground select-none">$ </span><span className="text-primary">anonli auth</span><span className="text-muted-foreground/60">            # Authenticate with your account</span></div>
                                <div><span className="text-muted-foreground select-none">$ </span><span className="text-primary">anonli alias new</span><span className="text-muted-foreground/60">       # Create an email alias</span></div>
                                <div><span className="text-muted-foreground select-none">$ </span><span className="text-primary">anonli alias list</span><span className="text-muted-foreground/60">      # List all your aliases</span></div>
                                <div><span className="text-muted-foreground select-none">$ </span><span className="text-primary">anonli alias toggle</span><span className="text-muted-foreground/60">    # Enable or disable an alias</span></div>
                                <div><span className="text-muted-foreground select-none">$ </span><span className="text-primary">anonli drop upload .</span><span className="text-muted-foreground/60">   # Upload encrypted files</span></div>
                                <div><span className="text-muted-foreground select-none">$ </span><span className="text-primary">anonli drop list</span><span className="text-muted-foreground/60">       # List your drops</span></div>
                                <div><span className="text-muted-foreground select-none">$ </span><span className="text-primary">anonli drop download</span><span className="text-muted-foreground/60">   # Download and decrypt a drop</span></div>
                                <div><span className="text-muted-foreground select-none">$ </span><span className="text-primary">anonli recipient list</span><span className="text-muted-foreground/60">  # List recipients</span></div>
                                <div><span className="text-muted-foreground select-none">$ </span><span className="text-primary">anonli whoami</span><span className="text-muted-foreground/60">          # Check account status</span></div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* How It Works */}
            <section className="py-20 bg-background border-t border-border/40">
                <div className="container mx-auto px-6">
                    <div className="text-center mb-14 space-y-4">
                        <h2 className="text-3xl md:text-4xl font-serif font-medium tracking-tight">Up and running</h2>
                        <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto font-light">
                            Install, link your account, and start scripting.
                        </p>
                    </div>

                    <div className="grid gap-16 md:grid-cols-3 relative">
                        <div className="hidden md:block absolute top-8 left-[20%] right-[20%] h-px bg-border z-0" />

                        <StepCard
                            number="1"
                            icon={<Download className="h-6 w-6" />}
                            title="Install"
                            description="One command to install via npm, bun, or our install script. Works on macOS, Linux, and Windows."
                        />
                        <StepCard
                            number="2"
                            icon={<Key className="h-6 w-6" />}
                            title="Authenticate"
                            description="Link your anon.li account with an API key. Run anonli auth and follow the prompts."
                        />
                        <StepCard
                            number="3"
                            icon={<Terminal className="h-6 w-6" />}
                            title="Use"
                            description="Manage aliases, share encrypted files, configure domains - all from your terminal."
                        />
                    </div>
                </div>
            </section>

            {/* CTA */}
            <CtaBanner
                title="Ready to go command-line?"
                description="Install the CLI and start managing your privacy from the terminal."
            >
                <div className="flex flex-col sm:flex-row justify-center pt-4 gap-4">
                    <Button asChild size="lg" variant="secondary" className="rounded-full px-8 bg-background text-foreground hover:bg-secondary transition-colors border-none font-medium">
                        <a href="#hero">
                            Install Now
                        </a>
                    </Button>
                    <Button asChild size="lg" variant="outline" className="rounded-full px-8 text-foreground bg-background/80 hover:bg-primary-foreground/20 font-medium">
                        <Link href="/docs">
                            View Documentation
                        </Link>
                    </Button>
                </div>
            </CtaBanner>

            {/* JSON-LD */}
            <script
                suppressHydrationWarning
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                        "@context": "https://schema.org",
                        "@type": "SoftwareApplication",
                        "name": "anon.li CLI",
                        "applicationCategory": "DeveloperApplication",
                        "operatingSystem": "macOS, Linux, Windows",
                        "offers": {
                            "@type": "Offer",
                            "price": "0",
                            "priceCurrency": "USD",
                        },
                        "description": "Command-line tool for managing private email aliases and encrypted file drops.",
                        "url": "https://anon.li/cli",
                        "downloadUrl": "https://www.npmjs.com/package/anonli",
                        "softwareVersion": "latest",
                        "author": {
                            "@type": "Organization",
                            "name": "anon.li",
                            "url": "https://anon.li",
                        },
                    }),
                }}
            />
        </>
    )
}
