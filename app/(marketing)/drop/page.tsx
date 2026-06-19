import Link from "next/link"
import { Metadata } from "next"
import { Button } from "@/components/ui/button"
import { Upload, Lock, Download, Clock, CheckCircle2, FileKey, Sparkles, KeyRound, Link2Off, FileText, ShieldCheck } from "lucide-react"
import { Icons } from "@/components/shared/icons"
import { FeatureCard } from "@/components/marketing/feature-card"
import { StepCard } from "@/components/marketing/step-card"
import { PageHero } from "@/components/marketing/page-hero"
import { MarketingBadge } from "@/components/marketing/marketing-badge"
import { CtaBanner } from "@/components/marketing/cta-banner"
import { TrustIndicatorBar } from "@/components/marketing/trust-indicator-bar"
import { DROP_PRO_LIMIT_LABELS } from "@/config/features"

import { siteConfig } from "@/config/site"

export const metadata: Metadata = {
    title: siteConfig.drop.metadata?.title,
    description: siteConfig.drop.description,
    openGraph: {
        title: siteConfig.drop.metadata?.title as string,
        description: siteConfig.drop.description,
        url: siteConfig.drop.url,
    },
    alternates: {
        canonical: siteConfig.drop.url,
    }
}

export default function DropProductPage() {
    return (
        <>
            <PageHero
                background="right"
                badge={
                    <MarketingBadge href="/blog/introduction">
                        Introducing anon.li <span className="font-serif">Drop</span>
                    </MarketingBadge>
                }
                title={
                    <>
                        Send any file.<br className="hidden md:block" />
                        <span className="italic text-muted-foreground">Only the recipient can open it.</span>
                    </>
                }
                subtitle={
                    <>
                        End-to-end encrypted file sharing for transfers up to {DROP_PRO_LIMIT_LABELS.maxFileSizeValue}. We can&apos;t see your files, only people with the full link can decrypt them.
                    </>
                }
                actions={
                    <div className="flex flex-row gap-3 sm:gap-4 w-full sm:w-auto justify-center">
                        <Button asChild size="lg" className="flex-1 sm:flex-none w-auto rounded-full px-4 sm:px-6 text-sm sm:text-base font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-200 shadow-lg shadow-primary/10 whitespace-nowrap">
                            <Link href="/drop/upload">
                                Upload Now <Upload className="ml-2 h-4 w-4" />
                            </Link>
                        </Button>
                        <Button variant="outline" size="lg" asChild className="flex-1 sm:flex-none w-auto rounded-full px-4 sm:px-6 text-sm sm:text-base border-primary/20 bg-background font-medium transition-colors whitespace-nowrap">
                            <Link href="/pricing?drop">Check Pricing <Sparkles className="ml-2 h-4 w-4 text-muted-foreground" /></Link>
                        </Button>
                    </div>
                }
            >
                <TrustIndicatorBar product="drop" />
            </PageHero>

            <section id="features" className="w-full py-20 bg-secondary/30 relative">
                <div className="container mx-auto px-6 relative z-10">
                    <div className="text-center mb-14 space-y-4">
                        <h2 className="text-3xl md:text-4xl font-serif font-medium tracking-tight">Built for privacy</h2>
                        <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto font-light">
                            Encryption happens in your browser, before anything leaves your device.
                        </p>
                    </div>
                    <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4 max-w-6xl mx-auto">
                        <FeatureCard
                            icon={<Lock className="h-6 w-6" />}
                            title="True E2E Encryption"
                            description="AES-256-GCM encryption happens in your browser. We never see your decryption keys or file contents."
                        />
                        <FeatureCard
                            icon={<FileText className="h-6 w-6" />}
                            title="Encrypted Filenames"
                            description="File names and optional drop titles are encrypted alongside file contents before upload."
                        />
                        <FeatureCard
                            icon={<Upload className="h-6 w-6" />}
                            title={`Up to ${DROP_PRO_LIMIT_LABELS.maxFileSizeValue} Per Transfer`}
                            description="Send multiple files in a single drop with smart, resumable chunking - all encrypted in your browser before they upload."
                        />
                        <FeatureCard
                            icon={<Download className="h-6 w-6" />}
                            title="No Account to Download"
                            description="Recipients open the link and decrypt in their browser without creating an anon.li account."
                        />
                        <FeatureCard
                            icon={<KeyRound className="h-6 w-6" />}
                            title="Password Protection"
                            description="Set your own password for an extra layer of protection. Recipients need both the link and password to decrypt."
                        />
                        <FeatureCard
                            icon={<Clock className="h-6 w-6" />}
                            title="Expiry & Download Limits"
                            description="Auto-delete after a chosen expiry or after the download cap is reached."
                        />
                        <FeatureCard
                            icon={<Link2Off className="h-6 w-6" />}
                            title="Link Controls & QR Sharing"
                            description="Disable or re-enable links, copy secure share URLs, and generate QR codes from the dashboard."
                        />
                        <FeatureCard
                            icon={<ShieldCheck className="h-6 w-6" />}
                            title="Vault Key Recovery"
                            description="Wrapped owner keys let your dashboard recover share links after upload without giving us plaintext keys."
                        />
                    </div>
                </div>
            </section>

            <section id="how-it-works" className="py-20 bg-background border-t border-border/40">
                <div className="container mx-auto px-6">
                    <div className="text-center mb-14 space-y-4">
                        <h2 className="text-3xl md:text-4xl font-serif font-medium tracking-tight">How it works</h2>
                        <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto font-light">
                            Three steps from drag-and-drop to a private link.
                        </p>
                    </div>

                    <div className="grid gap-16 md:grid-cols-3 relative">
                        {/* Line decoration */}
                        <div className="hidden md:block absolute top-8 left-[20%] right-[20%] h-px bg-border z-0" />

                        <StepCard
                            number="1"
                            icon={<Upload className="h-6 w-6" />}
                            title="Select Files"
                            description="Drop files into your browser. Encryption happens instantly on your device - no waiting for upload."
                        />
                        <StepCard
                            number="2"
                            icon={<FileKey className="h-6 w-6" />}
                            title="Get a Link"
                            description="Receive a unique link with the encryption key embedded. Only you and your recipient can access it."
                        />
                        <StepCard
                            number="3"
                            icon={<Download className="h-6 w-6" />}
                            title="Share Securely"
                            description="Send the link to anyone. Files decrypt in their browser - we never see the contents."
                        />
                    </div>
                </div>
            </section>

            {/* Comparison Section */}
            <section className="py-20 bg-secondary/20">
                <div className="container mx-auto px-6">
                    <div className="text-center mb-12 space-y-4">
                        <h2 className="text-3xl md:text-4xl font-serif font-medium tracking-tight">Why anon.li?</h2>
                        <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto font-light">
                            Unlike WeTransfer and Dropbox, we can&apos;t see your files - ever.
                        </p>
                    </div>

                    <div className="max-w-4xl mx-auto overflow-x-auto pb-6">
                        <div className="min-w-[600px] grid grid-cols-4 gap-3 text-sm">
                            <div className="col-span-1"></div>
                            <div className="text-center font-medium p-4 flex items-center justify-center gap-2">
                                <span className="bg-primary/10 p-1.5 rounded-lg">
                                    <Icons.logo className="h-4 w-4 text-primary" />
                                </span>
                                <span>anon.li</span>
                            </div>
                            <div className="text-center font-medium p-4 text-muted-foreground flex items-center justify-center">WeTransfer</div>
                            <div className="text-center font-medium p-4 text-muted-foreground flex items-center justify-center">Dropbox</div>

                            <ComparisonRow
                                feature="E2E Encryption"
                                anon={true}
                                wetransfer={false}
                                dropbox={false}
                            />
                            <ComparisonRow
                                feature="Zero Knowledge"
                                anon={true}
                                wetransfer={false}
                                dropbox={false}
                            />
                            <ComparisonRow
                                feature="Free Account"
                                anon={true}
                                wetransfer={true}
                                dropbox={false}
                            />
                            <ComparisonRow
                                feature="Open Source Encryption"
                                anon={true}
                                wetransfer={false}
                                dropbox={false}
                            />
                            <ComparisonRow
                                feature="Download Limits"
                                anon={true}
                                wetransfer={false}
                                dropbox={true}
                            />
                            <ComparisonRow
                                feature="No Tracking/Ads"
                                anon={true}
                                wetransfer={false}
                                dropbox={true}
                            />
                            <ComparisonRow
                                feature="Auto Delete"
                                anon={true}
                                wetransfer={true}
                                dropbox={false}
                            />
                            <ComparisonRow
                                feature="GDPR Compliant"
                                anon={true}
                                wetransfer={true}
                                dropbox={true}
                            />
                        </div>
                    </div>
                </div>
            </section>

            <CtaBanner
                title="Ready to share files privately?"
                description="Sign up for free and start sharing in seconds."
            >
                <div className="flex flex-col sm:flex-row justify-center pt-4 gap-3">
                    <Button asChild size="lg" variant="secondary" className="rounded-full px-8 bg-background text-foreground hover:bg-secondary transition-colors border-none font-medium">
                        <Link href="/drop/upload">
                            Upload Now <Upload className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                    <Button asChild size="lg" variant="outline" className="rounded-full px-8 text-foreground bg-background/80 hover:bg-secondary/70 font-medium">
                        <Link href="/pricing?drop">
                            View Pricing
                        </Link>
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
                        "name": "anon.li Drop",
                        "applicationCategory": "FileTransferApplication",
                        "operatingSystem": "Web",
                        "offers": {
                            "@type": "Offer",
                            "price": "0",
                            "priceCurrency": "USD"
                        },
                        "description": "End-to-end encrypted file sharing with zero knowledge."
                    })
                }}
            />
        </>
    )
}


function ComparisonRow({ feature, anon, wetransfer, dropbox }: { feature: string; anon: boolean; wetransfer: boolean; dropbox: boolean }) {
    return (
        <>
            <div className="p-3 bg-muted/50 rounded-l-lg font-medium">{feature}</div>
            <div className="p-3 bg-primary/5 text-center">
                {anon ? (
                    <CheckCircle2 className="h-5 w-5 text-primary mx-auto" />
                ) : (
                    <span className="text-muted-foreground">-</span>
                )}
            </div>
            <div className="p-3 bg-muted/30 text-center">
                {wetransfer ? (
                    <CheckCircle2 className="h-5 w-5 text-muted-foreground/50 mx-auto" />
                ) : (
                    <span className="text-muted-foreground">-</span>
                )}
            </div>
            <div className="p-3 bg-muted/30 rounded-r-lg text-center">
                {dropbox ? (
                    <CheckCircle2 className="h-5 w-5 text-muted-foreground/50 mx-auto" />
                ) : (
                    <span className="text-muted-foreground">-</span>
                )}
            </div>
        </>
    )
}
