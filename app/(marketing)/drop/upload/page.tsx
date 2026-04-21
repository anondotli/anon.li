import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import {
    Lock,
    Timer,
    UserX,
    Link as LinkIcon,
    Shield,
    Zap,
    Cloud,
    KeyRound,
    Globe,
    ArrowRight,
    Sparkles,
} from "lucide-react"
import { auth } from "@/auth"
import { Button } from "@/components/ui/button"
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion"
import { FeatureCard } from "@/components/marketing/feature-card"
import { StepCard } from "@/components/marketing/step-card"
import { InteractiveDotGrid } from "@/components/marketing/dot-grid"
import { TrustIndicatorBar } from "@/components/marketing/trust-indicator-bar"
import { GuestUploader } from "@/components/drop/guest-uploader"
import {
    GUEST_MAX_DROP_BYTES,
    GUEST_MAX_FILES_PER_DROP,
    PLAN_ENTITLEMENTS,
} from "@/config/plans"
import { formatBytes } from "@/lib/utils"
import { siteConfig } from "@/config/site"
import { getCspNonce } from "@/lib/csp"

const PAGE_URL = `${siteConfig.default.url}/drop/upload`
const FILE_SIZE_LABEL = formatBytes(GUEST_MAX_DROP_BYTES)
const EXPIRY_DAYS = PLAN_ENTITLEMENTS.drop.guest.maxExpiryDays

export const metadata: Metadata = {
    title: "Send Files Anonymously — Free Encrypted File Transfer",
    description: `Upload and share files up to ${FILE_SIZE_LABEL} without an account. End-to-end encrypted in your browser, auto-deleted in ${EXPIRY_DAYS} days. No tracking, no email required. WeTransfer alternative with zero-knowledge encryption.`,
    keywords: [
        "send file anonymously",
        "encrypted file transfer",
        "no account file sharing",
        "end to end encrypted upload",
        "secure file sharing",
        "private file transfer",
        "wetransfer alternative",
        "send large files privately",
        "zero knowledge file sharing",
        "e2ee file upload",
    ],
    alternates: {
        canonical: PAGE_URL,
    },
    openGraph: {
        title: "Send Files Anonymously — Free Encrypted File Transfer",
        description: `End-to-end encrypted. No account. Up to ${FILE_SIZE_LABEL}, auto-deleted in ${EXPIRY_DAYS} days.`,
        url: PAGE_URL,
        type: "website",
        siteName: siteConfig.default.name,
    },
    twitter: {
        card: "summary_large_image",
        title: "Send Files Anonymously — End-to-End Encrypted",
        description: `No account required. Files up to ${FILE_SIZE_LABEL}, encrypted in your browser.`,
    },
    robots: {
        index: true,
        follow: true,
    },
}

const HOW_IT_WORKS = [
    {
        icon: <Cloud className="h-6 w-6" />,
        title: "Drop a file",
        description: `Select or drag any file up to ${FILE_SIZE_LABEL}. Up to ${GUEST_MAX_FILES_PER_DROP} files per drop, directly from your browser.`,
    },
    {
        icon: <KeyRound className="h-6 w-6" />,
        title: "Encrypt locally",
        description: "AES-256-GCM encrypts every chunk before upload. The server never sees your plaintext or the decryption key.",
    },
    {
        icon: <LinkIcon className="h-6 w-6" />,
        title: "Share the link",
        description: "The decryption key rides in the URL fragment — only whoever you send the link to can open the file.",
    },
] as const

const FEATURES = [
    {
        icon: <Lock className="h-6 w-6" />,
        title: "Zero-knowledge by default",
        description: "Files are encrypted client-side with AES-256-GCM. We store only ciphertext and minimal metadata — never your decryption key.",
    },
    {
        icon: <UserX className="h-6 w-6" />,
        title: "No account, no email",
        description: "No sign-up, no verification, no email address. Drop the file, copy the link, walk away.",
    },
    {
        icon: <Timer className="h-6 w-6" />,
        title: `Auto-delete in ${EXPIRY_DAYS} days`,
        description: "Uploads expire automatically. Set a shorter window or cap the number of downloads to tighten the blast radius.",
    },
    {
        icon: <Shield className="h-6 w-6" />,
        title: "Open, auditable crypto",
        description: "Built on the browser's WebCrypto API. The encryption protocol is documented and independently verifiable.",
    },
    {
        icon: <Zap className="h-6 w-6" />,
        title: "Resumable uploads",
        description: "Chunked, parallel multipart uploads via presigned URLs. Bytes stream straight to object storage — never through a backend.",
    },
    {
        icon: <Globe className="h-6 w-6" />,
        title: "Works everywhere",
        description: "Any modern browser on any OS. No native app, no extension, no plugin. Your recipient just clicks a link.",
    },
] as const

const FAQ = [
    {
        q: "How do I send a file without signing up?",
        a: "Drop a file on this page, wait for it to encrypt and upload, then copy the share link. You can send that link over any channel — email, Signal, a QR code. The recipient clicks the link and downloads directly, no account needed on either side.",
    },
    {
        q: "Is the file actually encrypted before it leaves my browser?",
        a: "Yes. anon.li Drop uses WebCrypto AES-256-GCM to encrypt every chunk locally before upload. The decryption key is generated inside your browser and appended to the share link as a URL fragment — browsers never send URL fragments to the server.",
    },
    {
        q: "What's the maximum file size without an account?",
        a: `Guest uploads support files up to ${FILE_SIZE_LABEL}, with a cap of ${GUEST_MAX_FILES_PER_DROP} files per drop. Free accounts extend the per-file limit to 5 GB, and paid plans go higher still.`,
    },
    {
        q: "How long are files stored?",
        a: `Guest drops auto-delete after ${EXPIRY_DAYS} days. You can choose a shorter expiry or set a maximum download count at upload time. Once expired or fully downloaded, the encrypted bytes are purged from object storage.`,
    },
    {
        q: "Can anon.li read my files?",
        a: "No. The server stores only encrypted ciphertext, an initialization vector, and minimal metadata like size and chunk count. It never receives the decryption key — so staff, subpoenas, or a database breach cannot recover the plaintext.",
    },
    {
        q: "Is anon.li a WeTransfer alternative?",
        a: "Yes — with one critical difference. WeTransfer and Dropbox Transfer can see and scan the files you upload; anon.li cannot. Client-side end-to-end encryption makes the file contents mathematically inaccessible to us.",
    },
    {
        q: "What happens if I lose the link?",
        a: "The decryption key lives only in the link's URL fragment. If the link is lost, the file cannot be recovered — not by you, not by us. Treat the link like a password.",
    },
    {
        q: "Do you log IP addresses or track uploads?",
        a: "We apply ephemeral per-IP rate limits (short-TTL Redis windows) to prevent abuse, but we do not associate IPs with uploaded drops or keep persistent upload logs. Guest drops have no user record at all.",
    },
]

export default async function UploadCompatibilityPage() {
    const session = await auth()

    if (session?.user?.id) {
        redirect("/dashboard/drop")
    }

    const nonce = await getCspNonce()

    const softwareSchema = {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "anon.li Drop",
        applicationCategory: "SecurityApplication",
        operatingSystem: "Any (Web)",
        url: PAGE_URL,
        description: `Anonymous, end-to-end encrypted file sharing. Upload up to ${FILE_SIZE_LABEL} without an account.`,
        offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD",
        },
        featureList: [
            "Client-side AES-256-GCM encryption",
            "No account required",
            `Files up to ${FILE_SIZE_LABEL}`,
            `${EXPIRY_DAYS}-day auto-delete`,
            "Download limits",
        ],
    }

    const howToSchema = {
        "@context": "https://schema.org",
        "@type": "HowTo",
        name: "How to send a file anonymously with end-to-end encryption",
        description: "Upload an encrypted file with anon.li Drop without creating an account.",
        totalTime: "PT2M",
        step: HOW_IT_WORKS.map((s, i) => ({
            "@type": "HowToStep",
            position: i + 1,
            name: s.title,
            text: s.description,
        })),
    }

    const faqSchema = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: FAQ.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: {
                "@type": "Answer",
                text: item.a,
            },
        })),
    }

    return (
        <>
            {/* Hero + uploader */}
            <section className="relative w-full py-12 md:py-20 lg:py-24 overflow-hidden">
                {/* Background */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    <InteractiveDotGrid />
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/10 opacity-50 blur-[80px] rounded-full pointer-events-none" />
                    <div className="absolute bottom-0 right-0 w-[400px] h-[300px] bg-secondary/10 opacity-30 blur-[60px] rounded-full pointer-events-none" />
                </div>

                <div className="container mx-auto px-6 relative z-10">
                    <div className="flex flex-col items-center space-y-5 text-center">
                        <div className="inline-flex items-center rounded-full border border-primary/10 bg-background px-4 py-1.5 text-sm font-medium animate-in fade-in slide-in-from-bottom-4 duration-700">
                            <span className="flex h-2 w-2 rounded-full bg-primary mr-2 animate-pulse" />
                            <span className="text-primary/80 tracking-wide">
                                No account &middot; encrypted in your browser
                            </span>
                        </div>

                        <div className="space-y-6 max-w-4xl mx-auto w-full">
                            <h1 className="text-4xl font-medium tracking-tight sm:text-5xl md:text-6xl lg:text-7xl font-serif text-primary animate-in fade-in slide-in-from-bottom-6 duration-1000 fill-mode-both delay-100">
                                Send a file.<br className="hidden md:block" />
                                <span className="italic text-muted-foreground">Anonymously.</span>
                            </h1>
                            <p className="mx-auto max-w-2xl text-muted-foreground md:text-lg lg:text-xl leading-relaxed font-light animate-in fade-in slide-in-from-bottom-6 duration-1000 fill-mode-both delay-200">
                                Upload up to {FILE_SIZE_LABEL}, encrypted in your browser before it ever leaves.
                                Share the link — the key goes with it, and only the people you send it to can open the file.
                            </p>
                        </div>

                        <div className="w-full max-w-2xl pt-6 animate-in fade-in slide-in-from-bottom-6 duration-1000 fill-mode-both delay-300">
                            <GuestUploader />
                        </div>

                        <p className="text-xs text-muted-foreground/80 pt-2 animate-in fade-in duration-1000 delay-500">
                            Need more than {FILE_SIZE_LABEL} or longer retention?{" "}
                            <Link href="/register" className="text-primary hover:underline font-medium">
                                Create a free account
                            </Link>{" "}
                            for 5 GB files and {PLAN_ENTITLEMENTS.drop.free.maxExpiryDays}-day expiry.
                        </p>

                        <div className="pt-10 animate-in fade-in duration-1000 delay-500">
                            <TrustIndicatorBar product="drop" />
                        </div>
                    </div>
                </div>
            </section>

            {/* Features */}
            <section id="features" className="w-full py-20 bg-secondary/30 relative">
                <div className="container mx-auto px-6 relative z-10">
                    <div className="text-center mb-14 space-y-4">
                        <h2 className="text-3xl md:text-4xl font-serif font-medium tracking-tight">
                            Private by design
                        </h2>
                        <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto font-light">
                            A private, encrypted alternative to WeTransfer, Dropbox Transfer, and Google Drive share links.
                        </p>
                    </div>
                    <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto">
                        {FEATURES.map((feature) => (
                            <FeatureCard
                                key={feature.title}
                                icon={feature.icon}
                                title={feature.title}
                                description={feature.description}
                            />
                        ))}
                    </div>
                </div>
            </section>

            {/* How it works */}
            <section id="how-it-works" className="py-20 bg-background border-t border-border/40">
                <div className="container mx-auto px-6">
                    <div className="text-center mb-14 space-y-4">
                        <h2 className="text-3xl md:text-4xl font-serif font-medium tracking-tight">
                            How it works
                        </h2>
                        <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto font-light">
                            Three steps. No signup, no server that can read your data.
                        </p>
                    </div>

                    <div className="grid gap-16 md:grid-cols-3 relative max-w-5xl mx-auto">
                        <div className="hidden md:block absolute top-8 left-[20%] right-[20%] h-px bg-border z-0" />
                        {HOW_IT_WORKS.map((step, i) => (
                            <StepCard
                                key={step.title}
                                number={String(i + 1)}
                                icon={step.icon}
                                title={step.title}
                                description={step.description}
                            />
                        ))}
                    </div>
                </div>
            </section>

            {/* FAQ */}
            <section className="py-20 bg-secondary/20">
                <div className="container mx-auto px-6">
                    <div className="text-center mb-12 space-y-4">
                        <h2 className="text-3xl md:text-4xl font-serif font-medium tracking-tight">
                            Frequently asked
                        </h2>
                        <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto font-light">
                            Short, specific answers to what people ask before they upload.
                        </p>
                    </div>

                    <div className="max-w-3xl mx-auto">
                        <Accordion type="single" collapsible className="space-y-3">
                            {FAQ.map((item, i) => (
                                <AccordionItem
                                    key={item.q}
                                    value={`faq-${i}`}
                                    className="rounded-xl border border-border/60 bg-background px-5 data-[state=open]:border-primary/20"
                                >
                                    <AccordionTrigger className="text-left text-base font-medium hover:no-underline">
                                        {item.q}
                                    </AccordionTrigger>
                                    <AccordionContent className="text-muted-foreground leading-relaxed font-light">
                                        {item.a}
                                    </AccordionContent>
                                </AccordionItem>
                            ))}
                        </Accordion>

                        <p className="mt-10 text-center text-sm text-muted-foreground">
                            More questions?{" "}
                            <Link href="/faq" className="text-primary hover:underline font-medium">
                                Visit the full FAQ
                            </Link>
                            {" or "}
                            <Link href="/security" className="text-primary hover:underline font-medium">
                                read the security architecture
                            </Link>
                            .
                        </p>
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className="py-20 bg-background">
                <div className="container mx-auto px-6">
                    <div className="relative rounded-2xl overflow-hidden bg-primary text-primary-foreground px-6 py-16 md:px-16 md:py-20 text-center shadow-2xl">
                        <div className="absolute inset-0 opacity-5 bg-[url('/noise.svg')] mix-blend-overlay" />

                        <div className="relative z-10 space-y-6 max-w-3xl mx-auto">
                            <h2 className="text-3xl md:text-4xl lg:text-5xl font-serif font-medium tracking-tight leading-tight">
                                Want larger files and longer retention?
                            </h2>
                            <p className="text-lg opacity-90 font-light max-w-2xl mx-auto">
                                Free accounts get 5 GB uploads, {PLAN_ENTITLEMENTS.drop.free.maxExpiryDays}-day expiry,
                                email aliases, and a dashboard of your drops. Still free forever.
                            </p>
                            <div className="flex flex-col sm:flex-row justify-center pt-4 gap-3">
                                <Button asChild size="lg" variant="secondary" className="rounded-full px-8 bg-background text-foreground hover:bg-secondary transition-colors border-none font-medium">
                                    <Link href="/register">
                                        Create a free account <ArrowRight className="ml-2 h-4 w-4" />
                                    </Link>
                                </Button>
                                <Button asChild size="lg" variant="outline" className="rounded-full px-8 text-foreground bg-background/80 hover:bg-secondary/70 font-medium">
                                    <Link href="/pricing?drop">
                                        See pricing <Sparkles className="ml-2 h-4 w-4" />
                                    </Link>
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <script
                nonce={nonce}
                suppressHydrationWarning
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }}
            />
            <script
                nonce={nonce}
                suppressHydrationWarning
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(howToSchema) }}
            />
            <script
                nonce={nonce}
                suppressHydrationWarning
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
            />
        </>
    )
}
