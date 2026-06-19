import Link from "next/link"
import { Metadata } from "next"
import {
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
import { PageHero } from "@/components/marketing/page-hero"
import { MarketingBadge } from "@/components/marketing/marketing-badge"
import { CtaBanner } from "@/components/marketing/cta-banner"
import { HeroTrustBar } from "@/components/marketing/hero-trust-bar"

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

export default function McpPage() {
    return (
        <>
            {/* Hero */}
            <div id="hero">
                <PageHero
                    background="minimal"
                    badge={<MarketingBadge href="/docs/api/mcp">OAuth MCP Server</MarketingBadge>}
                    title="Let an AI agent manage your aliases."
                    subtitle="Connect Claude, Cursor, and MCP-compatible tools to manage aliases, recipients, and encrypted drop metadata through a standard OAuth flow."
                >
                    <McpConnectionPanel />
                    <div className="pt-10">
                        <HeroTrustBar
                            items={[
                                { label: "OAuth + PKCE" },
                                { label: "Streamable HTTP" },
                                { label: "Zero-Knowledge Boundaries" },
                            ]}
                        />
                    </div>
                </PageHero>
            </div>

            {/* Features */}
            <section className="w-full py-20 bg-background border-t border-border/40">
                <div className="container mx-auto px-6 relative z-10">
                    <div className="text-center mb-14 space-y-4">
                        <h2 className="text-3xl md:text-4xl font-serif font-medium tracking-tight">AI access without loose secrets</h2>
                        <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto font-light">
                            The MCP server gives agents the account controls they need while keeping private content outside the tool boundary.
                        </p>
                    </div>

                    <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto">
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
            <section className="w-full py-20 bg-secondary/20">
                <div className="container mx-auto px-6">
                    <div className="grid gap-16 lg:grid-cols-2 items-center">
                        <div className="space-y-6">
                            <h2 className="text-3xl md:text-4xl font-serif font-medium tracking-tight">Typed tools,<br />clear boundaries</h2>
                            <p className="text-base md:text-lg text-muted-foreground font-light leading-relaxed max-w-xl">
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
            <section className="py-20 bg-background border-t border-border/40">
                <div className="container mx-auto px-6">
                    <div className="text-center mb-14 space-y-4">
                        <h2 className="text-3xl md:text-4xl font-serif font-medium tracking-tight">Connect your agent</h2>
                        <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto font-light">
                            Add the endpoint, authorize through anon.li, then delegate.
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
            <CtaBanner
                title="Ready to connect your agent?"
                description="Add the MCP endpoint, authorize through anon.li, and keep encrypted content outside the agent boundary."
            >
                <div className="flex flex-col sm:flex-row justify-center pt-4 gap-4">
                    <Button asChild size="lg" variant="secondary" className="rounded-full px-8 bg-background text-foreground hover:bg-secondary transition-colors border-none font-medium">
                        <Link href="/docs/api/mcp">
                            Set Up MCP
                        </Link>
                    </Button>
                    <Button asChild size="lg" variant="outline" className="rounded-full px-8 text-foreground bg-background/80 hover:bg-background/60 font-medium">
                        <Link href="/register">
                            Create Account
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
