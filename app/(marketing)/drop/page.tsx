import Link from "next/link"
import { Metadata } from "next"
import { Button } from "@/components/ui/button"
import { Upload, Lock, Download, Clock, CheckCircle2, FileKey, Sparkles, KeyRound, Link2Off } from "lucide-react"
import { Icons } from "@/components/shared/icons"
import { FeatureCard } from "@/components/marketing/feature-card"
import { StepCard } from "@/components/marketing/step-card"
import { InteractiveDotGrid } from "@/components/marketing/dot-grid"
import { TrustIndicatorBar } from "@/components/marketing/trust-indicator-bar"

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

export default async function DropProductPage() {
    return (
        <>
            <section className="relative w-full py-12 md:py-20 lg:py-24 flex items-center justify-center min-h-[80vh] overflow-hidden">
                {/* Background */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    <InteractiveDotGrid />

                    {/* Subtle Glow Accents */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/10 opacity-50 blur-[80px] rounded-full pointer-events-none" />
                    <div className="absolute bottom-0 right-0 w-[400px] h-[300px] bg-secondary/10 opacity-30 blur-[60px] rounded-full pointer-events-none" />
                </div>

                <div className="container mx-auto px-6 relative z-10 w-full">
                    <div className="flex flex-col items-center space-y-5 text-center">

                        <Link href="/blog/introduction" className="inline-flex items-center rounded-full border border-primary/10 bg-background px-4 py-1.5 text-sm font-medium animate-in fade-in slide-in-from-bottom-4 duration-700 hover:bg-primary/10 hover:text-primary">
                            <span className="flex h-2 w-2 rounded-full bg-primary mr-2 animate-pulse"></span>
                            <span className="text-primary/80 tracking-wide">Introducing anon.li <span className="font-serif">Drop</span></span>
                        </Link>

                        <div className="space-y-6 max-w-5xl mx-auto w-full">
                            <h1 className="text-4xl font-medium tracking-tight sm:text-5xl md:text-6xl lg:text-7xl font-serif text-primary animate-in fade-in slide-in-from-bottom-6 duration-1000 fill-mode-both delay-100">
                                Share Files.<br className="hidden md:block" />
                                <span className="italic text-muted-foreground">Not Your Data.</span>
                            </h1>
                            <p className="mx-auto max-w-2xl text-muted-foreground md:text-lg lg:text-xl leading-relaxed font-light animate-in fade-in slide-in-from-bottom-6 duration-1000 fill-mode-both delay-200">
                                End-to-end encrypted file sharing. We can&apos;t see your files, only people with the full link can decrypt them.
                            </p>
                        </div>

                        <div className="flex flex-row gap-3 sm:gap-4 w-full sm:w-auto justify-center animate-in fade-in slide-in-from-bottom-6 duration-1000 fill-mode-both delay-300 pt-6 px-4 sm:px-0">
                            <Button asChild size="lg" className="flex-1 sm:flex-none w-auto rounded-full px-4 sm:px-6 text-sm sm:text-base font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-200 shadow-lg shadow-primary/10 whitespace-nowrap">
                                <Link href="/drop/upload">
                                    Upload Now <Upload className="ml-2 h-4 w-4" />
                                </Link>
                            </Button>
                            <Button variant="outline" size="lg" asChild className="flex-1 sm:flex-none w-auto rounded-full px-4 sm:px-6 text-sm sm:text-base border-primary/20 bg-background font-medium transition-colors whitespace-nowrap">
                                <Link href="/pricing?drop">Check Pricing <Sparkles className="ml-2 h-4 w-4 text-muted-foreground" /></Link>
                            </Button>
                        </div>

                        <div className="pt-10 animate-in fade-in duration-1000 delay-500">
                            <TrustIndicatorBar product="drop" />
                        </div>

                    </div>
                </div>
            </section>

            <section id="features" className="w-full py-20 bg-secondary/30 relative">
                <div className="container mx-auto px-6 relative z-10">
                    <div className="text-center mb-14 space-y-4">
                        <h2 className="text-3xl md:text-4xl font-serif font-medium tracking-tight">Built for privacy</h2>
                        <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto font-light">
                            Every feature designed around one principle: your files are yours alone.
                        </p>
                    </div>
                    <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto">
                        <FeatureCard
                            icon={<Lock className="h-6 w-6" />}
                            title="True E2E Encryption"
                            description="AES-256-GCM encryption happens in your browser. We never see your decryption keys or file contents."
                        />
                        <FeatureCard
                            icon={<Upload className="h-6 w-6" />}
                            title="Multi-File & Large Uploads"
                            description="Upload multiple files up to 250GB each with smart chunking that handles large files reliably."
                        />
                        <FeatureCard
                            icon={<Clock className="h-6 w-6" />}
                            title="Ephemeral by Design"
                            description="Auto-expire after a set time or burn after a set number of downloads. Your files don't linger."
                        />
                        <FeatureCard
                            icon={<KeyRound className="h-6 w-6" />}
                            title="Password Protection"
                            description="Set your own password for an extra layer of protection. Recipients need both the link and password to decrypt."
                        />
                        <FeatureCard
                            icon={<Link2Off className="h-6 w-6" />}
                            title="Full Link Control"
                            description="Revoke or re-enable download links at any time from your dashboard."
                        />
                    </div>
                </div>
            </section>

            <section id="how-it-works" className="py-20 bg-background border-t border-border/40">
                <div className="container mx-auto px-6">
                    <div className="text-center mb-14 space-y-4">
                        <h2 className="text-3xl md:text-4xl font-serif font-medium tracking-tight">How it works</h2>
                        <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto font-light">
                            Three simple steps. Your files stay yours.
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
                                feature="No Account Required"
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

            <section className="py-20 bg-background">
                <div className="container mx-auto px-6">
                    <div className="relative rounded-2xl overflow-hidden bg-primary text-primary-foreground px-6 py-16 md:px-16 md:py-20 text-center shadow-2xl">
                        {/* Texture */}
                        <div className="absolute inset-0 opacity-5 bg-[url('/noise.svg')] mix-blend-overlay"></div>

                        <div className="relative z-10 space-y-6 max-w-3xl mx-auto">
                            <h2 className="text-3xl md:text-4xl lg:text-5xl font-serif font-medium tracking-tight leading-tight">
                                Ready to share files privately?
                            </h2>
                            <p className="text-lg opacity-90 font-light max-w-2xl mx-auto">
                                No sign-up required for basic sharing. Get started in seconds.
                            </p>
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
                        </div>
                    </div>
                </div>
            </section>

            <script
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
