import Link from "next/link"
import { Metadata } from "next"
import { Button } from "@/components/ui/button"
import { Mail, FileUp, QrCode, Keyboard, Key, MousePointerClick, Download, CheckCircle2, Puzzle, ExternalLink } from "lucide-react"
import { FeatureCard } from "@/components/marketing/feature-card"
import { StepCard } from "@/components/marketing/step-card"
import { PageHero } from "@/components/marketing/page-hero"
import { MarketingBadge } from "@/components/marketing/marketing-badge"
import { CtaBanner } from "@/components/marketing/cta-banner"
import { BrowserBadges } from "./browser-badges"

export const metadata: Metadata = {
    title: "Browser Extension",
    description: "Manage private email aliases and encrypted drops directly from your browser. One-click alias generation, drop management, QR sharing, and keyboard shortcuts.",
    openGraph: {
        title: "anon.li Browser Extension - Privacy in Your Browser",
        description: "Manage private email aliases and encrypted drops directly from your browser. One-click alias generation, drop management, QR sharing, and keyboard shortcuts.",
        url: "https://anon.li/extension",
    },
    alternates: {
        canonical: "https://anon.li/extension",
    },
}

export default function ExtensionPage() {
    return (
        <>
            {/* Hero */}
            <div id="hero">
                <PageHero
                    background="right"
                    badge={<MarketingBadge>New: Browser Extension</MarketingBadge>}
                    title="Create an alias on any signup form."
                    subtitle="Manage aliases and drops directly from any website. One-click alias generation, drop management, and more."
                >
                    <BrowserBadges />
                    <div className="pt-12 flex flex-wrap justify-center gap-x-12 gap-y-6 text-xs font-medium uppercase tracking-widest text-muted-foreground/80">
                        <div className="flex items-center gap-3">
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                            <span>Firefox + Chrome install</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                            <span>Open Source</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                            <span>Keyboard-First</span>
                        </div>
                    </div>
                </PageHero>
            </div>

            {/* Features */}
            <section className="w-full py-20 bg-background border-t border-border/40">
                <div className="container mx-auto px-6 relative z-10">
                    <div className="text-center mb-14 space-y-4">
                        <h2 className="text-3xl md:text-4xl font-serif font-medium tracking-tight">What it does in the browser</h2>
                        <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto font-light">
                            Generate aliases, manage drops, and share — without leaving the page.
                        </p>
                    </div>

                    <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto">
                        <FeatureCard
                            icon={<Mail className="h-6 w-6" />}
                            title="One-Click Aliases"
                            description="Auto-detects email fields on any website. Generate and fill aliases with a single click."
                        />
                        <FeatureCard
                            icon={<FileUp className="h-6 w-6" />}
                            title="Drop Management"
                            description="View, toggle, share, and delete your encrypted drops. Copy URLs with decryption keys included."
                        />
                        <FeatureCard
                            icon={<QrCode className="h-6 w-6" />}
                            title="QR Code Sharing"
                            description="Generate QR codes for any drop link instantly. Share encrypted files without typing URLs."
                        />
                        <FeatureCard
                            icon={<Keyboard className="h-6 w-6" />}
                            title="Keyboard Shortcuts"
                            description="Full keyboard navigation. Press / to search, j/k to navigate, n to create."
                        />
                        <FeatureCard
                            icon={<Key className="h-6 w-6" />}
                            title="Vault Encryption"
                            description="All your encryption keys are stored in your encrypted vault, protected by your password."
                        />
                        <FeatureCard
                            icon={<MousePointerClick className="h-6 w-6" />}
                            title="Context Menus"
                            description="Right-click on any page to generate an alias. The page hostname is auto-filled as the label."
                        />
                    </div>
                </div>
            </section>

            {/* Keyboard Shortcuts Showcase */}
            <section className="w-full py-20 bg-secondary/20">
                <div className="container mx-auto px-6">
                    <div className="grid gap-16 lg:grid-cols-2 items-center">
                        <div className="space-y-6">
                            <h2 className="text-3xl md:text-4xl font-serif font-medium tracking-tight">Keyboard-first<br />design</h2>
                            <p className="text-base md:text-lg text-muted-foreground font-light leading-relaxed max-w-xl">
                                Navigate your aliases and drops without touching the mouse. Every action has a shortcut, every view is accessible from the keyboard.
                            </p>
                        </div>

                        <div className="rounded-2xl bg-background border border-border/60 p-8 shadow-lg overflow-x-auto">
                            <table className="w-full text-sm">
                                <tbody className="divide-y divide-border/40">
                                    <tr>
                                        <td className="py-3 pr-6"><kbd className="px-2.5 py-1 rounded-lg bg-muted border border-border/60 font-mono text-xs">1</kbd> <kbd className="px-2.5 py-1 rounded-lg bg-muted border border-border/60 font-mono text-xs">2</kbd></td>
                                        <td className="py-3 text-muted-foreground">Switch between Aliases and Drops tabs</td>
                                    </tr>
                                    <tr>
                                        <td className="py-3 pr-6"><kbd className="px-2.5 py-1 rounded-lg bg-muted border border-border/60 font-mono text-xs">n</kbd></td>
                                        <td className="py-3 text-muted-foreground">Create a new alias or drop</td>
                                    </tr>
                                    <tr>
                                        <td className="py-3 pr-6"><kbd className="px-2.5 py-1 rounded-lg bg-muted border border-border/60 font-mono text-xs">/</kbd></td>
                                        <td className="py-3 text-muted-foreground">Focus the search bar</td>
                                    </tr>
                                    <tr>
                                        <td className="py-3 pr-6"><kbd className="px-2.5 py-1 rounded-lg bg-muted border border-border/60 font-mono text-xs">j</kbd> <kbd className="px-2.5 py-1 rounded-lg bg-muted border border-border/60 font-mono text-xs">k</kbd></td>
                                        <td className="py-3 text-muted-foreground">Navigate up and down through items</td>
                                    </tr>
                                    <tr>
                                        <td className="py-3 pr-6"><kbd className="px-2.5 py-1 rounded-lg bg-muted border border-border/60 font-mono text-xs">Enter</kbd></td>
                                        <td className="py-3 text-muted-foreground">Copy the selected alias or drop URL</td>
                                    </tr>
                                    <tr>
                                        <td className="py-3 pr-6"><kbd className="px-2.5 py-1 rounded-lg bg-muted border border-border/60 font-mono text-xs">?</kbd></td>
                                        <td className="py-3 text-muted-foreground">Show keyboard shortcuts help</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </section>

            {/* How It Works */}
            <section className="py-20 bg-background border-t border-border/40">
                <div className="container mx-auto px-6">
                    <div className="text-center mb-14 space-y-4">
                        <h2 className="text-3xl md:text-4xl font-serif font-medium tracking-tight">Install and connect</h2>
                        <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto font-light">
                            Add it from the store, paste your API key, and start generating aliases.
                        </p>
                    </div>

                    <div className="grid gap-16 md:grid-cols-3 relative">
                        <div className="hidden md:block absolute top-8 left-[20%] right-[20%] h-px bg-border z-0" />

                        <StepCard
                            number="1"
                            icon={<Download className="h-6 w-6" />}
                            title="Install"
                            description="Install from Firefox Add-ons or Chrome Web Store today."
                        />
                        <StepCard
                            number="2"
                            icon={<Key className="h-6 w-6" />}
                            title="Connect"
                            description="Enter your API key in the extension settings. Test the connection and you're ready to go."
                        />
                        <StepCard
                            number="3"
                            icon={<Puzzle className="h-6 w-6" />}
                            title="Use"
                            description="Generate aliases on any site, manage drops, share via QR codes."
                        />
                    </div>
                </div>
            </section>

            {/* CTA */}
            <CtaBanner
                title="Ready to browse privately?"
                description="Install the extension and take your privacy with you everywhere you browse."
            >
                <div className="flex flex-col sm:flex-row justify-center pt-4 gap-4">
                    <Button asChild size="lg" variant="secondary" className="rounded-full px-8 bg-background text-foreground hover:bg-secondary transition-colors border-none font-medium">
                        <a href="#hero">
                            Add to Browser
                        </a>
                    </Button>
                    <Button asChild size="lg" variant="outline" className="rounded-full px-8 text-foreground bg-background/80 hover:bg-background/60 font-medium inline-flex items-center gap-2">
                        <Link href="https://github.com/anondotli/extension" target="_blank" rel="noopener noreferrer">
                            View on GitHub
                            <ExternalLink className="h-4 w-4" />
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
                        "name": "anon.li Browser Extension",
                        "applicationCategory": "BrowserApplication",
                        "operatingSystem": "Firefox",
                        "offers": {
                            "@type": "Offer",
                            "price": "0",
                            "priceCurrency": "USD",
                        },
                        "description": "Browser extension for managing private email aliases and encrypted file drops. One-click alias generation, drop management, QR sharing, and keyboard shortcuts.",
                        "url": "https://anon.li/extension",
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
