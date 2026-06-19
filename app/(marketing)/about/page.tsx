import type { Metadata } from "next"
import Link from "next/link"
import { siteConfig } from "@/config/site"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Shield, Heart, Users, Globe, Lock, Code, ArrowRight, ClipboardList } from "lucide-react"

export const metadata: Metadata = {
    title: siteConfig.about.metadata?.title,
    description: siteConfig.about.metadata?.description,
    openGraph: {
        title: siteConfig.about.metadata?.title as string,
        description: siteConfig.about.metadata?.description,
        url: siteConfig.about.url,
        type: "website",
    },
    alternates: {
        canonical: siteConfig.about.url,
    }
}

export default function AboutPage() {
    return (
        <div className="container max-w-4xl py-16 md:py-24 space-y-20">
            {/* Hero */}
            <section className="text-center space-y-6">
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif font-medium tracking-tight">
                    We built the privacy tools<br />
                    <span className="text-muted-foreground italic">we wanted to use.</span>
                </h1>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                    anon.li started because the privacy tools we relied on were either closed, expensive, or asked you to just trust them. So we built open ones where you don&apos;t have to: the encryption does the work, and the code is there to read.
                </p>
            </section>

            {/* Mission */}
            <section className="space-y-8">
                <h2 className="text-3xl font-serif font-medium text-center">Our Mission</h2>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                    <Card className="border-border/40">
                        <CardContent className="pt-6 space-y-4">
                            <div className="p-3 w-fit rounded-xl bg-primary/10 text-primary">
                                <Shield className="h-6 w-6" />
                            </div>
                            <h3 className="text-xl font-medium">Protect Identity</h3>
                            <p className="text-muted-foreground text-sm leading-relaxed">
                                Shield your real email from spam, trackers & hackers. Your identity stays yours.
                            </p>
                        </CardContent>
                    </Card>
                    <Card className="border-border/40">
                        <CardContent className="pt-6 space-y-4">
                            <div className="p-3 w-fit rounded-xl bg-primary/10 text-primary">
                                <Lock className="h-6 w-6" />
                            </div>
                            <h3 className="text-xl font-medium">Secure Sharing</h3>
                            <p className="text-muted-foreground text-sm leading-relaxed">
                                Enable truly private file sharing where even we can&apos;t see what you&apos;re sharing.
                            </p>
                        </CardContent>
                    </Card>
                    <Card className="border-border/40">
                        <CardContent className="pt-6 space-y-4">
                            <div className="p-3 w-fit rounded-xl bg-primary/10 text-primary">
                                <ClipboardList className="h-6 w-6" />
                            </div>
                            <h3 className="text-xl font-medium">Confidential Intake</h3>
                            <p className="text-muted-foreground text-sm leading-relaxed">
                                Encrypted forms for whistleblowing, patient intake & legal contact. Only you can decrypt.
                            </p>
                        </CardContent>
                    </Card>
                    <Card className="border-border/40">
                        <CardContent className="pt-6 space-y-4">
                            <div className="p-3 w-fit rounded-xl bg-primary/10 text-primary">
                                <Code className="h-6 w-6" />
                            </div>
                            <h3 className="text-xl font-medium">Transparency</h3>
                            <p className="text-muted-foreground text-sm leading-relaxed">
                                Our code is open source, so you can verify what we claim.
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </section>

            {/* Values */}
            <section className="space-y-8">
                <h2 className="text-3xl font-serif font-medium text-center">What We Believe</h2>
                <div className="space-y-6">
                    <ValueItem
                        icon={<Heart className="h-5 w-5" />}
                        title="Privacy is a Human Right"
                        description="Article 12 of the Universal Declaration of Human Rights protects privacy. We build tools to uphold that right in the digital age."
                    />
                    <ValueItem
                        icon={<Users className="h-5 w-5" />}
                        title="A free tier you can actually live on"
                        description="We offer generous free tiers because privacy shouldn't depend on your wallet. Paid plans help us sustain the service for everyone."
                    />
                    <ValueItem
                        icon={<Globe className="h-5 w-5" />}
                        title="Open source and auditable"
                        description="Our platform code is open source on GitHub. Anyone can audit our code and verify our claims."
                    />
                </div>
            </section>

            {/* Technical Philosophy */}
            <section className="rounded-3xl bg-secondary/30 p-8 md:p-12 space-y-6">
                <h2 className="text-3xl font-serif font-medium">Our Technical Philosophy</h2>
                <div className="space-y-4 text-muted-foreground leading-relaxed">
                    <p>
                        <strong className="text-foreground">Drop &amp; Form Are Zero-Knowledge by Design:</strong> Drop encryption happens on your device, and the file keys never reach our servers. Form responses are encrypted in the submitter&apos;s browser to your form&apos;s public key, so only you can decrypt them after unlocking your vault. Alias uses a different trust model: mail is forwarded in real time without being stored.
                    </p>
                    <p>
                        <strong className="text-foreground">Minimal Data Collection:</strong> We only collect what&apos;s absolutely necessary to provide the service. No selling data, no advertising trackers, and only cookie-free aggregate analytics.
                    </p>
                    <p>
                        <strong className="text-foreground">Open Source Security:</strong> Our platform code is open source on GitHub. We invite security researchers to audit our code and verify our claims. We provide a secure process for responsible disclosure of vulnerabilities.
                    </p>
                    <p>
                        <strong className="text-foreground">Industry Standards:</strong> We use proven cryptographic standards: AES-256-GCM, RSA... No custom crypto, no security through obscurity.
                    </p>
                </div>
            </section>

            {/* CTA */}
            <section className="text-center space-y-6">
                <h2 className="text-3xl font-serif font-medium">Try it on the free tier.</h2>
                <p className="text-muted-foreground max-w-xl mx-auto">
                    One account covers aliases, file sharing, and forms. No card to start.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <Button asChild size="lg" className="rounded-full">
                        <Link href="/register">
                            Create Free Account <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                    <Button variant="outline" asChild size="lg" className="rounded-full">
                        <Link href="/security">
                            View Security Details
                        </Link>
                    </Button>
                </div>
            </section>
        </div>
    )
}

function ValueItem({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
    return (
        <div className="flex gap-4 p-6 rounded-2xl border border-border/40 bg-background">
            <div className="flex-shrink-0 p-2 h-fit rounded-lg bg-primary/10 text-primary">
                {icon}
            </div>
            <div className="space-y-1">
                <h3 className="text-lg font-medium">{title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
            </div>
        </div>
    )
}
