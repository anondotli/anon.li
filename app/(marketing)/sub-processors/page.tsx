import type { Metadata } from "next"
import Link from "next/link"
import { ShieldCheck, Lock, ArrowRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

/*
 * Sub-processors disclosure. Entries below are grounded in the services actually
 * configured in lib/env.ts + vercel.json (Stripe, NOWPayments, Cloudflare R2,
 * Cloudflare Turnstile, Upstash, Resend, Vercel, optional Google/GitHub OAuth).
 * REVIEW BEFORE PUBLISHING: confirm each provider, its purpose, and especially
 * data-residency regions (left general here) and bump LAST_UPDATED — this page
 * is a customer-facing commitment once live.
 */

const TITLE = "Sub-processors — anon.li"
const DESCRIPTION =
    "The third-party providers anon.li uses to operate the service, what each one processes, and why. Most never see your plaintext — end-to-end encrypted content stays encrypted."
const URL = "https://anon.li/sub-processors"
const LAST_UPDATED = "June 11, 2026"

export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    openGraph: { title: TITLE, description: DESCRIPTION, url: URL, type: "website" },
    alternates: { canonical: URL },
}

interface SubProcessor {
    name: string
    category: "Payments" | "Infrastructure" | "Email" | "Security" | "Authentication"
    purpose: string
    data: string
    href: string
    /** True when the provider only ever handles ciphertext / cannot read user content. */
    zeroKnowledge?: boolean
}

const SUBPROCESSORS: SubProcessor[] = [
    {
        name: "Stripe",
        category: "Payments",
        purpose: "Card & subscription billing",
        data: "Billing contact and subscription metadata. Card details are entered directly with Stripe — anon.li never stores them.",
        href: "https://stripe.com/privacy",
    },
    {
        name: "NOWPayments",
        category: "Payments",
        purpose: "Cryptocurrency payments",
        data: "Crypto invoice and transaction data for orders paid in cryptocurrency.",
        href: "https://nowpayments.io/privacy-policy",
    },
    {
        name: "Vercel",
        category: "Infrastructure",
        purpose: "Application hosting & serverless compute",
        data: "Request metadata and operational logs needed to serve the application.",
        href: "https://vercel.com/legal/privacy-policy",
    },
    {
        name: "Cloudflare R2",
        category: "Infrastructure",
        purpose: "Object storage for Drop & Form files",
        data: "Encrypted file blobs only. Files are encrypted in your browser before upload; R2 never receives plaintext or keys.",
        href: "https://www.cloudflare.com/privacypolicy/",
        zeroKnowledge: true,
    },
    {
        name: "Upstash",
        category: "Infrastructure",
        purpose: "Redis for rate limiting & transient state",
        data: "Ephemeral counters and short-lived tokens, keyed by hashed identifiers. No message or file content.",
        href: "https://upstash.com/trust",
    },
    {
        name: "Resend",
        category: "Email",
        purpose: "Transactional email delivery",
        data: "Recipient address and message content for account email — magic links, verification, and security alerts.",
        href: "https://resend.com/legal/privacy-policy",
    },
    {
        name: "Cloudflare Turnstile",
        category: "Security",
        purpose: "Bot & abuse protection on sign-in",
        data: "Browser and network signals used to confirm a request comes from a human.",
        href: "https://www.cloudflare.com/privacypolicy/",
    },
    {
        name: "Google & GitHub",
        category: "Authentication",
        purpose: "Optional social sign-in (OAuth)",
        data: "Account email and basic profile — only if you choose to sign in with one of these providers.",
        href: "/privacy",
    },
]

export default function SubProcessorsPage() {
    return (
        <div className="container max-w-4xl py-16 md:py-24 space-y-16">
            {/* Hero */}
            <section className="text-center space-y-6">
                <div className="inline-flex items-center rounded-full border border-primary/10 bg-primary/5 px-4 py-1.5 text-sm">
                    <ShieldCheck className="mr-2 h-4 w-4 text-primary" />
                    <span className="text-primary/80">Trust &amp; transparency</span>
                </div>
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif font-medium tracking-tight">Sub-processors</h1>
                <p className="mx-auto max-w-2xl text-lg leading-relaxed text-muted-foreground font-light">
                    To run anon.li we rely on a small set of vetted providers. Here&apos;s exactly who they are and what
                    each one processes. By design, the services that touch your files and form responses see only
                    ciphertext — never your content.
                </p>
                <Badge variant="outline" className="rounded-full px-4 py-1.5">
                    Last updated {LAST_UPDATED}
                </Badge>
            </section>

            {/* Zero-knowledge boundary callout */}
            <section className="rounded-[2rem] border border-primary/15 bg-card p-6 md:p-8 flex gap-4 items-start">
                <Lock className="h-6 w-6 text-primary shrink-0 mt-0.5" />
                <div className="space-y-1.5">
                    <h2 className="text-lg font-serif font-medium">What our sub-processors cannot see</h2>
                    <p className="text-sm text-muted-foreground font-light leading-relaxed">
                        Drop files and Form submissions are end-to-end encrypted in your browser. Storage and
                        infrastructure providers receive only encrypted blobs; encryption keys never leave your device
                        unencrypted. Account data lives in anon.li&apos;s own PostgreSQL database, where vault-protected
                        fields are stored as ciphertext.
                    </p>
                </div>
            </section>

            {/* Table */}
            <section className="space-y-4">
                <div className="rounded-2xl border border-border/50 overflow-hidden">
                    <Table>
                        <TableHeader className="bg-secondary/40">
                            <TableRow className="hover:bg-transparent">
                                <TableHead className="px-5 py-3">Provider</TableHead>
                                <TableHead className="px-5 py-3">Purpose</TableHead>
                                <TableHead className="px-5 py-3">Data processed</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {SUBPROCESSORS.map((sp) => (
                                <TableRow key={sp.name}>
                                    <TableCell className="px-5 py-4 align-top">
                                        <div className="flex flex-col gap-1.5">
                                            <a
                                                href={sp.href}
                                                target={sp.href.startsWith("http") ? "_blank" : undefined}
                                                rel={sp.href.startsWith("http") ? "noopener noreferrer" : undefined}
                                                className="font-medium text-foreground hover:text-primary transition-colors"
                                            >
                                                {sp.name}
                                            </a>
                                            <Badge variant="secondary" className="w-fit rounded-full text-xs font-normal">
                                                {sp.category}
                                            </Badge>
                                            {sp.zeroKnowledge && (
                                                <span className="inline-flex w-fit items-center gap-1 text-xs text-primary">
                                                    <Lock className="h-3 w-3" /> ciphertext only
                                                </span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="px-5 py-4 align-top text-muted-foreground">{sp.purpose}</TableCell>
                                    <TableCell className="px-5 py-4 align-top text-muted-foreground font-light">{sp.data}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
                <p className="text-xs text-muted-foreground font-light">
                    Data residency follows each provider&apos;s configuration and DPA. Contact us for region-specific
                    details or a signed data processing agreement.
                </p>
            </section>

            {/* Changes & contact */}
            <section className="space-y-4">
                <h2 className="text-2xl font-serif font-medium">Changes to this list</h2>
                <p className="text-muted-foreground font-light leading-relaxed">
                    We update this page when we add or remove a sub-processor. For a data processing agreement (DPA),
                    sub-processor change notifications, or a security review, reach our team — Enterprise plans include
                    a contractual DPA.
                </p>
                <div className="flex flex-wrap gap-3 pt-2">
                    <Button asChild size="lg" className="rounded-full px-5">
                        <Link href="mailto:hi@anon.li?subject=anon.li%20DPA%20%2F%20sub-processors">
                            Request a DPA <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                    <Button asChild variant="outline" size="lg" className="rounded-full px-5">
                        <Link href="/security">Our security model</Link>
                    </Button>
                </div>
            </section>
        </div>
    )
}
