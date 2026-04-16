import Link from "next/link"
import { Metadata } from "next"
import { Button } from "@/components/ui/button"
import { Terminal, Download, Mail, Lock, Key, Globe, CheckCircle2 } from "lucide-react"
import { FeatureCard } from "@/components/marketing/feature-card"
import { StepCard } from "@/components/marketing/step-card"
import { InstallCommands } from "./install-commands"
import { getCspNonce } from "@/lib/csp"

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

export default async function CliPage() {
    const nonce = await getCspNonce()

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
                        <Link href="https://codeberg.org/anonli/cli" className="inline-flex items-center rounded-full border border-primary/10 bg-background px-4 py-1.5 text-sm font-medium animate-in fade-in slide-in-from-bottom-4 duration-700 hover:scale-105 hover:text-primary">
                            <span className="flex h-2 w-2 rounded-full bg-primary mr-2 animate-pulse"></span>
                            <span className="text-primary/80 tracking-wide">Open Source CLI</span>
                        </Link>

                        <div className="space-y-6 max-w-5xl mx-auto w-full">
                            <h1 className="text-5xl font-medium tracking-tight sm:text-6xl md:text-7xl lg:text-8xl font-serif text-primary animate-in fade-in slide-in-from-bottom-6 duration-1000 fill-mode-both delay-100">
                                Your Privacy Suite.<br className="hidden md:block" />
                                <span className="italic text-muted-foreground">In Your Terminal.</span>
                            </h1>
                            <p className="mx-auto max-w-2xl text-muted-foreground md:text-xl lg:text-2xl leading-relaxed font-light animate-in fade-in slide-in-from-bottom-6 duration-1000 fill-mode-both delay-200">
                                Manage private email aliases and share encrypted files - all from the command line. Fast, scriptable & open source.
                            </p>
                        </div>

                        <div className="w-full animate-in fade-in slide-in-from-bottom-6 duration-1000 fill-mode-both delay-300 pt-10 px-4 sm:px-0">
                            <InstallCommands />
                        </div>

                        <div className="pt-12 flex flex-wrap justify-center gap-x-12 gap-y-6 text-sm font-medium text-muted-foreground/80 animate-in fade-in duration-1000 delay-500 uppercase tracking-widest text-xs">
                            <div className="flex items-center gap-3">
                                <CheckCircle2 className="h-4 w-4 text-primary" />
                                <span>Cross-Platform</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <CheckCircle2 className="h-4 w-4 text-primary" />
                                <span>Open Source</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <CheckCircle2 className="h-4 w-4 text-primary" />
                                <span>E2E Encrypted</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features */}
            <section className="w-full py-32 bg-background border-t border-border/40">
                <div className="container mx-auto px-6 relative z-10">
                    <div className="text-center mb-20 space-y-6">
                        <h2 className="text-4xl md:text-5xl font-serif font-medium tracking-tight">Everything you need</h2>
                        <p className="text-lg text-muted-foreground max-w-2xl mx-auto font-light">
                            The full anon.li experience, built for your terminal.
                        </p>
                    </div>

                    <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
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
            <section className="w-full py-32 bg-secondary/20">
                <div className="container mx-auto px-6">
                    <div className="grid gap-16 lg:grid-cols-2 items-center">
                        <div className="space-y-6">
                            <h2 className="text-4xl md:text-5xl font-serif font-medium tracking-tight">Powerful commands,<br />simple syntax</h2>
                            <p className="text-lg text-muted-foreground font-light leading-relaxed max-w-xl">
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
            <section className="py-32 bg-background border-t border-border/40">
                <div className="container mx-auto px-6">
                    <div className="text-center mb-24 space-y-6">
                        <h2 className="text-4xl md:text-5xl font-serif font-medium tracking-tight">Get started in three steps</h2>
                        <p className="text-lg text-muted-foreground max-w-2xl mx-auto font-light">
                            From install to first command in under a minute.
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
                            description="Manage aliases, share encrypted files, configure domains — all from your terminal."
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
                                Ready to go command-line?
                            </h2>
                            <p className="text-xl opacity-90 font-light max-w-2xl mx-auto">
                                Install the CLI and start managing your privacy from the terminal.
                            </p>
                            <div className="flex flex-col sm:flex-row justify-center pt-4 gap-4">
                                <Button asChild size="xl" variant="secondary" className="rounded-full px-12 h-16 text-lg bg-background text-foreground hover:bg-secondary transition-colors border-none font-medium">
                                    <a href="#hero">
                                        Install Now
                                    </a>
                                </Button>
                                <Button asChild size="xl" variant="outline" className="rounded-full px-12 h-16 text-lg text-foreground bg-background/80 hover:bg-primary-foreground/20 font-medium">
                                    <Link href="/docs">
                                        View Documentation
                                    </Link>
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* JSON-LD */}
            <script
                nonce={nonce}
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
