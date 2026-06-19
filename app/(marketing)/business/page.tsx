import Link from "next/link"
import { Metadata } from "next"
import {
    Building2,
    Users,
    Lock,
    KeyRound,
    Globe,
    Mail,
    FileUp,
    CreditCard,
    UserCog,
    ShieldCheck,
    ArrowRight,
    ClipboardList,
    Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { FeatureCard } from "@/components/marketing/feature-card"
import { StepCard } from "@/components/marketing/step-card"
import { PageHero } from "@/components/marketing/page-hero"
import { MarketingBadge } from "@/components/marketing/marketing-badge"

// Zero-knowledge sharing flow, rendered as a semantic ordered list. The final
// step is the "proof" line and uses the lock marker instead of a number.
const ZERO_KNOWLEDGE_FLOW = [
    "member generates a keypair on unlock",
    "admin seals the team key to their public key",
    "member unwraps it & opens shared resources",
] as const
const ZERO_KNOWLEDGE_PROOF = "server saw only ciphertext the whole time"

const TITLE = "anon.li for Business — private email, files & forms for your whole team"
const DESCRIPTION =
    "Give your team shared anonymous aliases, custom domains, and zero-knowledge encrypted file sharing — with per-seat billing, roles, and centralized control. Members decrypt the same resources; the server never can."
const URL = "https://anon.li/business"

export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    openGraph: { title: TITLE, description: DESCRIPTION, url: URL },
    alternates: { canonical: URL },
}

export default function BusinessPage() {
    return (
        <>
            {/* ── Hero ─────────────────────────────────────────────────────── */}
            <PageHero
                background="right"
                badge={
                    <MarketingBadge>
                        anon.li for <span className="font-serif">Business</span>
                    </MarketingBadge>
                }
                title={
                    <>
                        Privacy your whole
                        <br className="hidden md:block" />
                        <span className="italic text-muted-foreground"> team can share.</span>
                    </>
                }
                subtitle="Shared anonymous aliases, custom domains, and end-to-end encrypted file sharing for your organization - with per-seat billing, roles, and centralized control."
                actions={
                    <div className="flex flex-row gap-3 sm:gap-4 w-full sm:w-auto justify-center">
                        <Button
                            asChild
                            size="lg"
                            className="flex-1 sm:flex-none rounded-full px-6 font-medium shadow-lg shadow-primary/10"
                        >
                            <Link href="/register">
                                Start a team <ArrowRight className="ml-2 h-4 w-4" />
                            </Link>
                        </Button>
                        <Button
                            variant="outline"
                            size="lg"
                            asChild
                            className="flex-1 sm:flex-none rounded-full px-6 border-primary/20 bg-background font-medium"
                        >
                            <Link href="mailto:hi@anon.li?subject=anon.li%20for%20Business">
                                Talk to sales <Building2 className="ml-2 h-4 w-4 text-muted-foreground" />
                            </Link>
                        </Button>
                    </div>
                }
            />

            {/* ── Value props ──────────────────────────────────────────────── */}
            <section id="features" className="w-full py-20 bg-secondary/30">
                <div className="container mx-auto px-6">
                    <div className="text-center mb-14 space-y-4">
                        <h2 className="text-3xl md:text-4xl font-serif font-medium tracking-tight">
                            Everything your team needs, nothing it leaks
                        </h2>
                        <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto font-light">
                            The same zero-knowledge tools, now shared across your organization.
                        </p>
                    </div>
                    <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto">
                        <FeatureCard
                            icon={<Mail className="h-6 w-6" />}
                            title="Shared team aliases"
                            description="Spin up support@, sales@, or per-person aliases that forward to the right people — and never expose a real inbox."
                        />
                        <FeatureCard
                            icon={<Globe className="h-6 w-6" />}
                            title="Your custom domains"
                            description="Verify @yourcompany.com once and let the whole team create aliases on it, with catch-all routing."
                        />
                        <FeatureCard
                            icon={<FileUp className="h-6 w-6" />}
                            title="Shared encrypted file sharing"
                            description="Drop files that teammates can open and the server can't. Members decrypt the same files via a shared, key-wrapped team vault."
                        />
                        <FeatureCard
                            icon={<ClipboardList className="h-6 w-6" />}
                            title="Encrypted team forms"
                            description="Collect intake, tips, or applications that stay encrypted end-to-end — readable only by your team, never by us."
                        />
                        <FeatureCard
                            icon={<UserCog className="h-6 w-6" />}
                            title="Roles & member management"
                            description="Owner, admin, and member roles. Invite, remove, and control who can manage domains, billing, and shared resources."
                        />
                        <FeatureCard
                            icon={<CreditCard className="h-6 w-6" />}
                            title="One bill, per seat"
                            description="A single subscription covers alias, drop, and form for every member. Add or remove seats as the team changes."
                        />
                    </div>
                </div>
            </section>

            {/* ── The differentiator: zero-knowledge sharing ───────────────── */}
            <section className="py-20 bg-background border-t border-border/40">
                <div className="container mx-auto px-6">
                    <div className="grid gap-12 lg:grid-cols-2 items-center max-w-6xl mx-auto">
                        <div className="space-y-6">
                            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                                <Lock className="h-3.5 w-3.5" /> Zero-knowledge by design
                            </div>
                            <h2 className="text-3xl md:text-4xl font-serif font-medium tracking-tight">
                                Encrypted for your whole team
                            </h2>
                            <p className="text-muted-foreground font-light leading-relaxed">
                                Most &ldquo;team&rdquo; privacy tools just move your plaintext to a company account
                                they can still read. anon.li doesn&apos;t. Every shared Drop and Form is encrypted to a team
                                key that&apos;s wrapped to each member&apos;s own keypair, so adding a teammate seals that key
                                to their device — our servers never hold a readable copy.
                            </p>
                            <ul className="space-y-3 text-sm text-muted-foreground">
                                <li className="flex items-start gap-3">
                                    <KeyRound className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                                    <span>Members decrypt the same resources in their browser; the server only ever stores ciphertext and wrapped keys.</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <Users className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                                    <span>Admins grant access using only a member&apos;s public key — no password sharing, no plaintext handoff.</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                                    <span>Remove someone and rotate the team key, and they lose access to anything shared afterward.</span>
                                </li>
                            </ul>
                        </div>
                        <div className="rounded-[2rem] border border-primary/15 bg-card p-8 md:p-10 shadow-xl shadow-primary/5">
                            <ol className="font-mono text-sm">
                                {ZERO_KNOWLEDGE_FLOW.map((step, i) => (
                                    <li key={i} className="flex gap-3">
                                        <div className="flex flex-col items-center">
                                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">
                                                {i + 1}
                                            </span>
                                            <span aria-hidden className="my-1 h-4 w-px border-l border-dashed border-border/60" />
                                        </div>
                                        <span className="pt-1.5 leading-tight text-muted-foreground">{step}</span>
                                    </li>
                                ))}
                                <li className="flex gap-3">
                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                                        <Lock className="h-3.5 w-3.5" />
                                    </span>
                                    <span className="pt-1.5 leading-tight text-primary">{ZERO_KNOWLEDGE_PROOF}</span>
                                </li>
                            </ol>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── How it works ─────────────────────────────────────────────── */}
            <section className="py-20 bg-secondary/30 border-t border-border/40">
                <div className="container mx-auto px-6">
                    <div className="text-center mb-14 space-y-4">
                        <h2 className="text-3xl md:text-4xl font-serif font-medium tracking-tight">
                            Set up your team
                        </h2>
                    </div>
                    <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4 max-w-6xl mx-auto">
                        <StepCard
                            number="1"
                            icon={<Building2 className="h-6 w-6" />}
                            title="Create your team"
                            description="Spin up an organization and pick the seats you need."
                        />
                        <StepCard
                            number="2"
                            icon={<Users className="h-6 w-6" />}
                            title="Invite members"
                            description="Add teammates by email and assign owner, admin, or member roles."
                        />
                        <StepCard
                            number="3"
                            icon={<Globe className="h-6 w-6" />}
                            title="Verify a domain"
                            description="Point @yourcompany.com at anon.li and share aliases across the team."
                        />
                        <StepCard
                            number="4"
                            icon={<FileUp className="h-6 w-6" />}
                            title="Share, encrypted"
                            description="Send Drops and collect Forms your team can open — and no one else can."
                        />
                    </div>
                </div>
            </section>

            {/* ── Pricing teaser + final CTA ───────────────────────────────── */}
            <section className="py-24 bg-background border-t border-border/40">
                <div className="container mx-auto px-6">
                    <div className="max-w-3xl mx-auto text-center space-y-6">
                        <h2 className="text-3xl md:text-4xl font-serif font-medium tracking-tight text-primary">
                            Simple per-seat pricing
                        </h2>
                        <p className="text-muted-foreground font-light leading-relaxed">
                            One Business plan covers alias, drop, and form for every member. Need volume pricing,
                            custom terms, or a security review? Enterprise is sales-led — tell us what you need.
                        </p>
                        <div className="flex flex-row gap-3 sm:gap-4 justify-center pt-2">
                            <Button asChild size="lg" className="rounded-full px-6 font-medium shadow-lg shadow-primary/10">
                                <Link href="/pricing#teams">
                                    See team pricing <Sparkles className="ml-2 h-4 w-4" />
                                </Link>
                            </Button>
                            <Button asChild variant="outline" size="lg" className="rounded-full px-6 border-primary/20 bg-background font-medium">
                                <Link href="mailto:hi@anon.li?subject=anon.li%20Enterprise">Contact sales</Link>
                            </Button>
                        </div>
                    </div>
                </div>
            </section>
        </>
    )
}
