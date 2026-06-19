import Link from "next/link"
import { Metadata } from "next"
import {
    Lock,
    ClipboardList,
    ShieldCheck,
    KeyRound,
    FileJson,
    UsersRound,
    Mail,
    FileUp,
    LayoutList,
    Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { FeatureCard } from "@/components/marketing/feature-card"
import { StepCard } from "@/components/marketing/step-card"
import { PageHero } from "@/components/marketing/page-hero"
import { MarketingBadge } from "@/components/marketing/marketing-badge"
import { CtaBanner } from "@/components/marketing/cta-banner"
import { HeroTrustBar } from "@/components/marketing/hero-trust-bar"
import { siteConfig } from "@/config/site"

export const metadata: Metadata = {
    title: siteConfig.form.metadata?.title,
    description: siteConfig.form.description,
    openGraph: {
        title: siteConfig.form.metadata?.title as string,
        description: siteConfig.form.description,
        url: siteConfig.form.url,
    },
    alternates: {
        canonical: siteConfig.form.url,
    },
}

export default function FormProductPage() {
    return (
        <>
            <PageHero
                background="minimal"
                badge={
                    <MarketingBadge>
                        Introducing anon.li <span className="font-serif">Form</span>
                    </MarketingBadge>
                }
                title={
                    <>
                        Collect responses.<br className="hidden md:block" />
                        <span className="italic text-muted-foreground">Only you can read them.</span>
                    </>
                }
                subtitle="End-to-end encrypted forms for whistleblowing, patient intake, legal contact & anything confidential. Only you can decrypt submissions."
                actions={
                    <div className="flex flex-row gap-3 sm:gap-4 w-full sm:w-auto justify-center">
                        <Button
                            asChild
                            size="lg"
                            className="flex-1 sm:flex-none rounded-full px-6 font-medium shadow-lg shadow-primary/10"
                        >
                            <Link href="/dashboard/form/new">
                                Create a form <ClipboardList className="ml-2 h-4 w-4" />
                            </Link>
                        </Button>
                        <Button
                            variant="outline"
                            size="lg"
                            asChild
                            className="flex-1 sm:flex-none rounded-full px-6 border-primary/20 bg-background font-medium"
                        >
                            <Link href="/pricing?form">
                                Check pricing <Sparkles className="ml-2 h-4 w-4 text-muted-foreground" />
                            </Link>
                        </Button>
                    </div>
                }
            >
                <HeroTrustBar
                    items={[
                        { label: "End-to-End Encrypted" },
                        { label: "Zero-Knowledge" },
                        { label: "Open Source" },
                    ]}
                />
            </PageHero>

            <section id="use-cases" className="w-full py-20 bg-secondary/30">
                <div className="container mx-auto px-6">
                    <div className="text-center mb-14 space-y-4">
                        <h2 className="text-3xl md:text-4xl font-serif font-medium tracking-tight">
                            Built for sensitive intake
                        </h2>
                        <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto font-light">
                            When a Google Form would betray trust, anon.li Form keeps responses encrypted end-to-end.
                        </p>
                    </div>
                    <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4 max-w-6xl mx-auto">
                        <FeatureCard
                            icon={<ShieldCheck className="h-6 w-6" />}
                            title="Whistleblowing"
                            description="Run an anonymous tip line where only your ethics team can decrypt incoming reports."
                        />
                        <FeatureCard
                            icon={<UsersRound className="h-6 w-6" />}
                            title="Patient intake"
                            description="Clinics collect PHI without a third party seeing medical history in clear text."
                        />
                        <FeatureCard
                            icon={<Mail className="h-6 w-6" />}
                            title="Legal contact"
                            description="Let clients describe their situation encrypted in their browser before it reaches you."
                        />
                        <FeatureCard
                            icon={<ClipboardList className="h-6 w-6" />}
                            title="Confidential applications"
                            description="HR forms, grant applications, and research surveys that should never sit in plaintext."
                        />
                    </div>
                </div>
            </section>

            <section id="features" className="py-20 bg-background border-t border-border/40">
                <div className="container mx-auto px-6">
                    <div className="text-center mb-14 space-y-4">
                        <h2 className="text-3xl md:text-4xl font-serif font-medium tracking-tight">
                            Every response, encrypted
                        </h2>
                    </div>
                    <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto">
                        <FeatureCard
                            icon={<Lock className="h-6 w-6" />}
                            title="Per-form keypair"
                            description="Each form gets its own P-256 keypair. The private half never leaves your vault unwrapped."
                        />
                        <FeatureCard
                            icon={<KeyRound className="h-6 w-6" />}
                            title="Hybrid encryption"
                            description="Submitters derive a shared secret with your public key, then encrypt answers with AES-256-GCM."
                        />
                        <FeatureCard
                            icon={<LayoutList className="h-6 w-6" />}
                            title="Block or JSON builder"
                            description="Drag blocks together - or paste a JSON schema. Share the same shape with your CLI and AI tools."
                        />
                        <FeatureCard
                            icon={<FileJson className="h-6 w-6" />}
                            title="Schema-first"
                            description="A versioned JSON schema defines your form. Developers and agents can author and diff it like code."
                        />
                        <FeatureCard
                            icon={<FileUp className="h-6 w-6" />}
                            title="File attachments"
                            description="Accept files per submission with owner-billed storage governed by the form plan."
                        />
                        <FeatureCard
                            icon={<Mail className="h-6 w-6" />}
                            title="Account email notifications"
                            description="Get an account-email alert on new submissions. We never include encrypted response content."
                        />
                    </div>
                </div>
            </section>

            <section id="how-it-works" className="py-20 bg-secondary/20 border-t border-border/40">
                <div className="container mx-auto px-6">
                    <div className="text-center mb-14 space-y-4">
                        <h2 className="text-3xl md:text-4xl font-serif font-medium tracking-tight">How it works</h2>
                        <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto font-light">
                            A one-way channel from your submitters straight into your vault.
                        </p>
                    </div>
                    <div className="grid gap-16 md:grid-cols-3 relative">
                        <div className="hidden md:block absolute top-8 left-[20%] right-[20%] h-px bg-border z-0" />
                        <StepCard
                            number="1"
                            icon={<ClipboardList className="h-6 w-6" />}
                            title="Design the form"
                            description="Assemble fields visually or paste JSON. A form keypair is generated and wrapped in your vault."
                        />
                        <StepCard
                            number="2"
                            icon={<Lock className="h-6 w-6" />}
                            title="Share the link"
                            description="Submitters open /f/[id]. Their browser encrypts answers with your public key before anything leaves their device."
                        />
                        <StepCard
                            number="3"
                            icon={<KeyRound className="h-6 w-6" />}
                            title="Decrypt in your dashboard"
                            description="Unlock your vault to unwrap the private key and read the response. Our servers only ever see ciphertext."
                        />
                    </div>
                </div>
            </section>

            <CtaBanner
                title="Ready for your first encrypted form?"
                description="Sign up for free and publish a form in minutes."
            >
                <div className="flex flex-col sm:flex-row justify-center pt-4 gap-3">
                    <Button
                        asChild
                        size="lg"
                        variant="secondary"
                        className="rounded-full px-8 bg-background text-foreground hover:bg-secondary font-medium"
                    >
                        <Link href="/register">Get started</Link>
                    </Button>
                    <Button
                        asChild
                        size="lg"
                        variant="outline"
                        className="rounded-full px-8 text-foreground bg-background/80 hover:bg-secondary/70 font-medium"
                    >
                        <Link href="/pricing?form">View pricing</Link>
                    </Button>
                </div>
            </CtaBanner>

            <script
                suppressHydrationWarning
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                        "@context": "https://schema.org",
                        "@type": "SoftwareApplication",
                        name: "anon.li Form",
                        applicationCategory: "BusinessApplication",
                        operatingSystem: "Web",
                        offers: {
                            "@type": "Offer",
                            price: "0",
                            priceCurrency: "USD",
                        },
                        description: "End-to-end encrypted forms for confidential intake.",
                    }),
                }}
            />
        </>
    )
}
