import type { Metadata } from "next"
import Link from "next/link"
import { siteConfig } from "@/config/site"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Shield, Heart, Users, Globe, Lock, Code, ArrowRight } from "lucide-react"

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
                    Privacy Should Be a Right,<br />
                    <span className="text-muted-foreground italic">Not a Privilege</span>
                </h1>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                    We believe everyone deserves digital privacy, regardless of technical skill or budget. That&apos;s why we&apos;re building open source privacy tools that make privacy simple and accessible.
                </p>
            </section>

            {/* Mission */}
            <section className="space-y-8">
                <h2 className="text-3xl font-serif font-medium text-center">Our Mission</h2>
                <div className="grid gap-6 md:grid-cols-3">
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
                                <Code className="h-6 w-6" />
                            </div>
                            <h3 className="text-xl font-medium">Transparency</h3>
                            <p className="text-muted-foreground text-sm leading-relaxed">
                                Our code is open source. Trust through transparency, not promises.
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
                        title="Community Over Profit"
                        description="We offer generous free tiers because privacy shouldn't depend on your wallet. Paid plans help us sustain the service for everyone."
                    />
                    <ValueItem
                        icon={<Globe className="h-5 w-5" />}
                        title="Transparency Builds Trust"
                        description="Our platform code is open source on Codeberg. Anyone can audit our code and verify our claims."
                    />
                </div>
            </section>

            {/* Technical Philosophy */}
            <section className="rounded-3xl bg-secondary/30 p-8 md:p-12 space-y-6">
                <h2 className="text-3xl font-serif font-medium">Our Technical Philosophy</h2>
                <div className="space-y-4 text-muted-foreground leading-relaxed">
                    <p>
                        <strong className="text-foreground">Drop Is Zero-Knowledge by Design:</strong> Drop encryption happens on your device, and the file keys never reach our servers. Alias uses a different trust model: mail is forwarded in real time without being stored.
                    </p>
                    <p>
                        <strong className="text-foreground">Minimal Data Collection:</strong> We only collect what&apos;s absolutely necessary to provide the service. No selling data, no advertising trackers, and only cookie-free aggregate analytics.
                    </p>
                    <p>
                        <strong className="text-foreground">Open Source Security:</strong> Our platform code is open source on Codeberg. We invite security researchers to audit our code and verify our claims. We provide a secure process for responsible disclosure of vulnerabilities.
                    </p>
                    <p>
                        <strong className="text-foreground">Industry Standards:</strong> We use proven cryptographic standards: AES-256-GCM, RSA... No custom crypto, no security through obscurity.
                    </p>
                </div>
            </section>

            {/* CTA */}
            <section className="text-center space-y-6">
                <h2 className="text-3xl font-serif font-medium">Ready to Protect Your Privacy?</h2>
                <p className="text-muted-foreground max-w-xl mx-auto">
                    Protect your digital identity with anon.li. Get started in seconds.
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
