import Link from "next/link"
import { Metadata } from "next"
import {
    CheckCircle2,
    Code2,
    FileText,
    Key,
    Lock,
    Mail,
    Shield,
    Terminal,
    Users,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { FeatureCard } from "@/components/marketing/feature-card"
import { StepCard } from "@/components/marketing/step-card"
import { getCspNonce } from "@/lib/csp"

export const metadata: Metadata = {
    title: "MCP Server",
    description:
        "Connect Claude, Cursor, and other MCP-compatible AI agents to anon.li with OAuth. Manage aliases, recipients, and drop metadata without exposing encrypted content.",
    openGraph: {
        title: "anon.li MCP Server - Private AI Agent Access",
        description:
            "Connect AI agents to anon.li with OAuth and safely manage aliases, recipients, and encrypted drop metadata.",
        url: "https://anon.li/mcp",
    },
    alternates: {
        canonical: "https://anon.li/mcp",
    },
}

const toolRows = [
    ["list_aliases", "Review active aliases, counters, and timestamps"],
    ["create_alias", "Generate random or custom aliases for new services"],
    ["toggle_alias", "Pause or restore an address by ID or email"],
    ["list_recipients", "Check verified forwarding destinations"],
    ["list_drops", "Inspect encrypted drop metadata without file contents"],
    ["delete_drop", "Clean up old drops and reclaim storage quota"],
] as const

export default async function McpPage() {
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
                        <Link href="/docs/api/mcp" className="inline-flex items-center rounded-full border border-primary/10 bg-background px-4 py-1.5 text-sm font-medium animate-in fade-in slide-in-from-bottom-4 duration-700 hover:scale-105 hover:text-primary">
                            <span className="flex h-2 w-2 rounded-full bg-primary mr-2 animate-pulse"></span>
                            <span className="text-primary/80 tracking-wide">OAuth MCP Server</span>
                        </Link>

                        <div className="space-y-6 max-w-5xl mx-auto w-full">
                            <h1 className="text-4xl font-medium tracking-tight sm:text-5xl md:text-6xl lg:text-7xl font-serif text-primary animate-in fade-in slide-in-from-bottom-6 duration-1000 fill-mode-both delay-100">
                                Your Privacy Suite.<br className="hidden md:block" />
                                <span className="italic text-muted-foreground">In Your AI Agent.</span>
                            </h1>
                            <p className="mx-auto max-w-2xl text-muted-foreground md:text-lg lg:text-xl leading-relaxed font-light animate-in fade-in slide-in-from-bottom-6 duration-1000 fill-mode-both delay-200">
                                Connect Claude, Cursor, and MCP-compatible tools to manage aliases, recipients, and encrypted drop metadata through a standard OAuth flow.
                            </p>
                        </div>

                        <div className="w-full animate-in fade-in slide-in-from-bottom-6 duration-1000 fill-mode-both delay-300 pt-10 px-4 sm:px-0">
                            <McpConnectionPanel />
                        </div>

                        <div className="pt-12 flex flex-wrap justify-center gap-x-12 gap-y-6 text-sm font-medium text-muted-foreground/80 animate-in fade-in duration-1000 delay-500 uppercase tracking-widest text-xs">
                            <div className="flex items-center gap-3">
                                <CheckCircle2 className="h-4 w-4 text-primary" />
                                <span>OAuth + PKCE</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <CheckCircle2 className="h-4 w-4 text-primary" />
                                <span>Streamable HTTP</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <CheckCircle2 className="h-4 w-4 text-primary" />
                                <span>Zero-Knowledge Boundaries</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features */}
            <section className="w-full py-32 bg-background border-t border-border/40">
                <div className="container mx-auto px-6 relative z-10">
                    <div className="text-center mb-20 space-y-6">
                        <h2 className="text-4xl md:text-5xl font-serif font-medium tracking-tight">AI access without loose secrets</h2>
                        <p className="text-lg text-muted-foreground max-w-2xl mx-auto font-light">
                            The MCP server gives agents the account controls they need while keeping private content outside the tool boundary.
                        </p>
                    </div>

                    <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                        <FeatureCard
                            icon={<Key className="h-6 w-6" />}
                            title="OAuth Connector Flow"
                            description="Agents connect through sign-in and consent. You never paste a long-lived API key into a third-party client."
                        />
                        <FeatureCard
                            icon={<Mail className="h-6 w-6" />}
                            title="Alias Automation"
                            description="Create, list, toggle, and delete aliases from natural-language workflows and agent tasks."
                        />
                        <FeatureCard
                            icon={<Users className="h-6 w-6" />}
                            title="Recipient Management"
                            description="List verified inboxes and add new recipients while verification stays under your control."
                        />
                        <FeatureCard
                            icon={<FileText className="h-6 w-6" />}
                            title="Drop Metadata"
                            description="List, disable, re-enable, and delete drops without exposing filenames, files, or decryption keys."
                        />
                        <FeatureCard
                            icon={<Code2 className="h-6 w-6" />}
                            title="Standard MCP Transport"
                            description="Use the modern Streamable HTTP transport with clients that support custom MCP connectors."
                        />
                        <FeatureCard
                            icon={<Lock className="h-6 w-6" />}
                            title="Encrypted Data Stays Private"
                            description="Vault-encrypted notes, labels, drop names, and file contents remain unreadable to AI clients."
                        />
                    </div>
                </div>
            </section>

            {/* Tools Showcase */}
            <section className="w-full py-32 bg-secondary/20">
                <div className="container mx-auto px-6">
                    <div className="grid gap-16 lg:grid-cols-2 items-center">
                        <div className="space-y-6">
                            <h2 className="text-4xl md:text-5xl font-serif font-medium tracking-tight">Typed tools,<br />clear boundaries</h2>
                            <p className="text-lg text-muted-foreground font-light leading-relaxed max-w-xl">
                                MCP turns everyday privacy operations into explicit tool calls. Agents can work on the control plane, but encrypted content stays protected by anon.li&apos;s browser and vault encryption model.
                            </p>
                            <div className="flex flex-col sm:flex-row gap-3 pt-2">
                                <Button asChild className="rounded-full">
                                    <Link href="/docs/api/mcp">View Documentation</Link>
                                </Button>
                                <Button asChild variant="outline" className="rounded-full bg-background">
                                    <Link href="/security">Security Architecture</Link>
                                </Button>
                            </div>
                        </div>

                        <div className="rounded-2xl bg-background border border-border/60 p-8 shadow-lg overflow-x-auto">
                            <table className="w-full text-sm">
                                <tbody className="divide-y divide-border/40">
                                    {toolRows.map(([tool, description]) => (
                                        <tr key={tool}>
                                            <td className="py-3 pr-6 align-top">
                                                <code className="px-2.5 py-1 rounded-lg bg-muted border border-border/60 font-mono text-xs text-primary whitespace-nowrap">
                                                    {tool}
                                                </code>
                                            </td>
                                            <td className="py-3 text-muted-foreground">{description}</td>
                                        </tr>
                                    ))}
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
                        <h2 className="text-4xl md:text-5xl font-serif font-medium tracking-tight">Connect in three steps</h2>
                        <p className="text-lg text-muted-foreground max-w-2xl mx-auto font-light">
                            From connector URL to first agent task in minutes.
                        </p>
                    </div>

                    <div className="grid gap-16 md:grid-cols-3 relative">
                        <div className="hidden md:block absolute top-8 left-[20%] right-[20%] h-px bg-border z-0" />

                        <StepCard
                            number="1"
                            icon={<Code2 className="h-6 w-6" />}
                            title="Add"
                            description="Use https://anon.li/api/mcp as the custom connector URL in your MCP-compatible client."
                        />
                        <StepCard
                            number="2"
                            icon={<Key className="h-6 w-6" />}
                            title="Authorize"
                            description="Sign in to anon.li, complete 2FA if enabled, and approve the OAuth consent screen."
                        />
                        <StepCard
                            number="3"
                            icon={<Shield className="h-6 w-6" />}
                            title="Delegate"
                            description="Ask your agent to create aliases, review recipients, or clean up drop metadata."
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
                                Ready to connect your agent?
                            </h2>
                            <p className="text-xl opacity-90 font-light max-w-2xl mx-auto">
                                Add the MCP endpoint, authorize through anon.li, and keep encrypted content outside the agent boundary.
                            </p>
                            <div className="flex flex-col sm:flex-row justify-center pt-4 gap-4">
                                <Button asChild size="xl" variant="secondary" className="rounded-full px-12 h-16 text-lg bg-background text-foreground hover:bg-secondary transition-colors border-none font-medium">
                                    <Link href="/docs/api/mcp">
                                        Set Up MCP
                                    </Link>
                                </Button>
                                <Button asChild size="xl" variant="outline" className="rounded-full px-12 h-16 text-lg text-foreground bg-background/80 hover:bg-background/60 font-medium">
                                    <Link href="/register">
                                        Create Account
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
                        "name": "anon.li MCP Server",
                        "applicationCategory": "DeveloperApplication",
                        "operatingSystem": "Web",
                        "offers": {
                            "@type": "Offer",
                            "price": "0",
                            "priceCurrency": "USD",
                        },
                        "description": "OAuth-protected MCP server for managing anon.li aliases, recipients, and encrypted drop metadata from AI agents.",
                        "url": "https://anon.li/mcp",
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

function McpConnectionPanel() {
    return (
        <div className="mx-auto max-w-4xl rounded-2xl bg-background border border-border/60 p-6 md:p-8 shadow-lg text-left overflow-hidden">
            <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr] lg:items-center">
                <div className="space-y-3">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-primary/5 text-primary">
                            <Terminal className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-sm font-medium">MCP Endpoint</p>
                            <p className="text-xs text-muted-foreground">Streamable HTTP transport</p>
                        </div>
                    </div>
                    <code className="block rounded-xl border border-border/50 bg-secondary/30 p-4 font-mono text-sm text-primary break-all">
                        https://anon.li/api/mcp
                    </code>
                </div>

                <div className="rounded-xl border border-border/50 bg-secondary/20 p-4 text-sm leading-relaxed text-muted-foreground">
                    Add this URL as a custom MCP connector in Claude, Cursor, or any compatible client.
                </div>
            </div>
        </div>
    )
}
