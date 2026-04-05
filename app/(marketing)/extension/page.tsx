import Link from "next/link"
import { Metadata } from "next"
import { Button } from "@/components/ui/button"
import { Mail, FileUp, QrCode, Keyboard, Key, MousePointerClick, Download, CheckCircle2, Puzzle, ExternalLink } from "lucide-react"
import { FeatureCard } from "@/components/marketing/feature-card"
import { StepCard } from "@/components/marketing/step-card"
import { BrowserBadges } from "./browser-badges"

export const metadata: Metadata = {
    title: "Browser Extension",
    description: "Manage anonymous email aliases and encrypted drops directly from your browser. One-click alias generation, drop management, QR sharing, and keyboard shortcuts.",
    openGraph: {
        title: "anon.li Browser Extension - Privacy in Your Browser",
        description: "Manage anonymous email aliases and encrypted drops directly from your browser. One-click alias generation, drop management, QR sharing, and keyboard shortcuts.",
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
            <section id="hero" className="relative w-full py-16 md:py-24 lg:py-32 flex items-center justify-center min-h-[90vh] overflow-hidden">
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(hsl(var(--primary))_1px,transparent_1px)] [background-size:16px_16px] opacity-20 [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_70%,transparent_100%)]" />
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-primary/10 opacity-50 blur-[100px] rounded-full pointer-events-none" />
                    <div className="absolute bottom-0 right-0 w-[600px] h-[400px] bg-secondary/10 opacity-30 blur-[80px] rounded-full pointer-events-none" />
                </div>

                <div className="container mx-auto px-6 relative z-10 w-full">
                    <div className="flex flex-col items-center space-y-5 text-center">
                        <div className="inline-flex items-center rounded-full border border-primary/10 bg-background px-4 py-1.5 text-sm font-medium animate-in fade-in slide-in-from-bottom-4 duration-700 hover:bg-primary/10 hover:text-primary">
                            <span className="flex h-2 w-2 rounded-full bg-primary mr-2 animate-pulse"></span>
                            <span className="text-primary/80 tracking-wide">New: Browser Extension</span>
                        </div>

                        <div className="space-y-6 max-w-5xl mx-auto w-full">
                            <h1 className="text-5xl font-medium tracking-tight sm:text-6xl md:text-7xl lg:text-8xl font-serif text-primary animate-in fade-in slide-in-from-bottom-6 duration-1000 fill-mode-both delay-100">
                                Your Privacy Suite.<br className="hidden md:block" />
                                <span className="italic text-muted-foreground">In Your Browser.</span>
                            </h1>
                            <p className="mx-auto max-w-2xl text-muted-foreground md:text-xl lg:text-2xl leading-relaxed font-light animate-in fade-in slide-in-from-bottom-6 duration-1000 fill-mode-both delay-200">
                                Manage aliases and drops directly from any website. One-click alias generation, drop management, and more.
                            </p>
                        </div>

                        <div className="w-full animate-in fade-in slide-in-from-bottom-6 duration-1000 fill-mode-both delay-300 pt-10">
                            <BrowserBadges />
                        </div>

                        <div className="pt-12 flex flex-wrap justify-center gap-x-12 gap-y-6 text-sm font-medium text-muted-foreground/80 animate-in fade-in duration-1000 delay-500 uppercase tracking-widest text-xs">
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
                    </div>
                </div>
            </section>

            {/* Features */}
            <section className="w-full py-32 bg-background border-t border-border/40">
                <div className="container mx-auto px-6 relative z-10">
                    <div className="text-center mb-20 space-y-6">
                        <h2 className="text-4xl md:text-5xl font-serif font-medium tracking-tight">Everything at your fingertips</h2>
                        <p className="text-lg text-muted-foreground max-w-2xl mx-auto font-light">
                            The full anon.li experience, built for your browser.
                        </p>
                    </div>

                    <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                        <FeatureCard
                            icon={<Mail className="h-6 w-6" />}
                            title="One-Click Aliases"
                            description="Auto-detects email fields on any website. Generate and fill anonymous aliases with a single click."
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
                            title="Remember Drop Keys"
                            description="Optionally save decryption keys locally on this browser profile after you open a Drop link."
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
            <section className="w-full py-32 bg-secondary/20">
                <div className="container mx-auto px-6">
                    <div className="grid gap-16 lg:grid-cols-2 items-center">
                        <div className="space-y-6">
                            <h2 className="text-4xl md:text-5xl font-serif font-medium tracking-tight">Keyboard-first<br />design</h2>
                            <p className="text-lg text-muted-foreground font-light leading-relaxed max-w-xl">
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
            <section className="py-32 bg-background border-t border-border/40">
                <div className="container mx-auto px-6">
                    <div className="text-center mb-24 space-y-6">
                        <h2 className="text-4xl md:text-5xl font-serif font-medium tracking-tight">Get started in three steps</h2>
                        <p className="text-lg text-muted-foreground max-w-2xl mx-auto font-light">
                            From install to first alias in under a minute.
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
            <section className="py-32 bg-background">
                <div className="container mx-auto px-6">
                    <div className="relative rounded-[2.5rem] overflow-hidden bg-primary text-primary-foreground px-6 py-24 md:px-24 md:py-32 text-center shadow-2xl">
                        <div className="absolute inset-0 opacity-20 bg-[url('/noise.svg')] mix-blend-overlay"></div>

                        <div className="relative z-10 space-y-10 max-w-4xl mx-auto">
                            <h2 className="text-4xl md:text-5xl lg:text-6xl font-serif font-medium tracking-tight leading-tight">
                                Ready to browse privately?
                            </h2>
                            <p className="text-xl opacity-90 font-light max-w-2xl mx-auto">
                                Install the extension and take your privacy with you everywhere you browse.
                            </p>
                            <div className="flex flex-col sm:flex-row justify-center pt-4 gap-4">
                                <Button asChild size="xl" variant="secondary" className="rounded-full px-12 h-16 text-lg bg-background text-foreground hover:bg-secondary transition-colors border-none font-medium">
                                    <a href="#hero">
                                        Add to Browser
                                    </a>
                                </Button>
                                <Button asChild size="xl" variant="outline" className="rounded-full px-12 h-16 text-lg text-foreground bg-background/80 hover:bg-background/60 font-medium inline-flex items-center gap-2">
                                    <Link href="https://github.com/anondotli/extension" target="_blank" rel="noopener noreferrer">
                                        View on GitHub
                                        <ExternalLink className="h-4 w-4" />
                                    </Link>
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* JSON-LD */}
            <script
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
                        "description": "Browser extension for managing anonymous email aliases and encrypted file drops. One-click alias generation, drop management, QR sharing, and keyboard shortcuts.",
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
