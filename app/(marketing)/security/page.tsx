import type { Metadata } from "next"
import Link from "next/link"
import { siteConfig } from "@/config/site"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Shield, Lock, Key, Eye, FileCode, ArrowRight, CheckCircle2, AlertTriangle, Code, DatabaseBackup, Info } from "lucide-react"
import { ClaimCards } from "@/components/marketing/claim-cards"
import { getClaimsByClass, getClaimsByIds } from "@/config/claims"

export const metadata: Metadata = {
    title: siteConfig.security.metadata?.title,
    description: siteConfig.security.metadata?.description,
    openGraph: {
        title: siteConfig.security.metadata?.title as string,
        description: siteConfig.security.metadata?.description,
        url: siteConfig.security.url,
        type: "website",
    },
    alternates: {
        canonical: siteConfig.security.url,
    }
}

export default function SecurityPage() {
    return (
        <div className="container max-w-4xl py-16 md:py-24 space-y-20">
            {/* Hero */}
            <section className="text-center space-y-6">
                <div className="inline-flex items-center rounded-full border border-green-500/20 bg-green-500/10 px-4 py-1.5 text-sm">
                    <Shield className="mr-2 h-4 w-4 text-green-600" />
                    <span className="text-green-700 dark:text-green-400">Security First Design</span>
                </div>
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif font-medium tracking-tight">
                    Security You Can Verify
                </h1>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                    Our security posture is strongest where architecture removes trust entirely. Drop is designed so we cannot access file plaintext or keys, vault-enabled accounts derive secrets client-side with Argon2id, and Alias relies on a separate published forwarding stack built around transient routing, reply-tokenized responses, and optional PGP for delivered copies.
                </p>
            </section>

            {/* Zero Knowledge */}
            <section className="space-y-8">
                <div className="text-center space-y-4">
                    <h2 className="text-3xl font-serif font-medium">Trust Boundaries</h2>
                    <p className="text-muted-foreground max-w-2xl mx-auto">
                        Drop is zero-knowledge. Alias has a different trust model centered on forwarding rather than mailbox hosting, with optional PGP for the delivered copy.
                    </p>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                    <Card className="border-border/40">
                        <CardHeader>
                            <div className="p-3 w-fit rounded-xl bg-primary/10 text-primary mb-2">
                                <Lock className="h-6 w-6" />
                            </div>
                            <CardTitle>Drop Encryption</CardTitle>
                            <CardDescription>End-to-end encrypted file sharing</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm text-muted-foreground">
                            <p>• Files are encrypted <strong className="text-foreground">in your browser</strong> before upload</p>
                            <p>• AES-256-GCM encryption with unique keys per file</p>
                            <p>• Keys are embedded in the URL fragment (never sent to our servers)</p>
                            <p>• Even filenames are encrypted</p>
                            <p>• Recipients decrypt in their browser</p>
                        </CardContent>
                    </Card>

                    <Card className="border-border/40">
                        <CardHeader>
                            <div className="p-3 w-fit rounded-xl bg-primary/10 text-primary mb-2">
                                <Key className="h-6 w-6" />
                            </div>
                            <CardTitle>Alias Forwarding</CardTitle>
                            <CardDescription>Private email forwarding</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm text-muted-foreground">
                            <p>• Aliases are disposable identities</p>
                            <p>• Mail is forwarded to your real inbox instead of stored in a hosted mailbox</p>
                            <p>• Optional PGP encryption for the delivered copy</p>
                            <p>• Reply-by-alias uses tokenized <code className="text-foreground">@reply.anon.li</code> addresses</p>
                            <p>• Standard forwarding still requires transient server-side processing</p>
                            <p>• Your real email stays hidden</p>
                            <p>• Alias labels and notes are being migrated into vault-backed encryption as users unlock</p>
                        </CardContent>
                    </Card>

                    <Card className="border-border/40">
                        <CardHeader>
                            <div className="p-3 w-fit rounded-xl bg-primary/10 text-primary mb-2">
                                <Shield className="h-6 w-6" />
                            </div>
                            <CardTitle>Two-Factor Authentication</CardTitle>
                            <CardDescription>TOTP-based account protection</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm text-muted-foreground">
                            <p>• Optional TOTP-based 2FA for all accounts</p>
                            <p>• Works with any authenticator app</p>
                            <p>• Backup codes for account recovery</p>
                            <p>• Password-backed sign-in for vault-enabled accounts</p>
                            <p>• Magic-link verification and recovery</p>
                        </CardContent>
                    </Card>

                    <Card className="border-border/40">
                        <CardHeader>
                            <div className="p-3 w-fit rounded-xl bg-primary/10 text-primary mb-2">
                                <DatabaseBackup className="h-6 w-6" />
                            </div>
                            <CardTitle>Data Export & Account Deletion</CardTitle>
                            <CardDescription>Full control over your data</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm text-muted-foreground">
                            <p>• Export all your account data (GDPR compliant)</p>
                            <p>• Permanent account deletion on request</p>
                            <p>• Removes all aliases, drops, and domains</p>
                            <p>• Data purged from active systems on deletion; backups cleared within 30 days</p>
                            <p>• Self-service from your dashboard settings</p>
                        </CardContent>
                    </Card>
                </div>
            </section>

            {/* Encryption Details */}
            <section className="rounded-3xl bg-secondary/30 p-8 md:p-12 space-y-8">
                <h2 className="text-3xl font-serif font-medium">Cryptographic Standards</h2>
                <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-4">
                        <h3 className="font-medium flex items-center gap-2">
                            <CheckCircle2 className="h-5 w-5 text-green-600" />
                            What We Use
                        </h3>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                            <li><strong className="text-foreground">AES-256-GCM</strong> - File encryption (authenticated encryption)</li>
                            <li><strong className="text-foreground">Argon2id</strong> - Client-side vault password derivation and drop password wrapping</li>
                            <li><strong className="text-foreground">Web Crypto API</strong> - Browser-native cryptography</li>
                            <li><strong className="text-foreground">RSA/PGP</strong> - Email encryption (optional)</li>
                            <li><strong className="text-foreground">TLS</strong> - Transport encryption</li>
                        </ul>
                    </div>
                    <div className="space-y-4">
                        <h3 className="font-medium flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-amber-600" />
                            What We Avoid
                        </h3>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                            <li><strong className="text-foreground">No custom crypto</strong> - We use proven standards only</li>
                            <li><strong className="text-foreground">No key escrow</strong> - We never hold copies of your keys</li>
                            <li><strong className="text-foreground">No server-side decryption for Drop</strong> - File encryption and decryption happen client-side</li>
                            <li><strong className="text-foreground">Minimal metadata</strong> - Logs limited to basic routing data, auto-deleted after 7 days</li>
                            <li><strong className="text-foreground">Cookie-free analytics only</strong> - Aggregate analytics without advertising trackers</li>
                        </ul>
                    </div>
                </div>
            </section>

            {/* How File Encryption Works */}
            <section className="space-y-8">
                <h2 className="text-3xl font-serif font-medium text-center">How File Encryption Works</h2>
                <div className="space-y-6">
                    <StepCard
                        number="1"
                        title="Key Generation"
                        description="When you upload a file, your browser generates a random 256-bit AES key using the Web Crypto API. This key never leaves your device unless you share the link."
                    />
                    <StepCard
                        number="2"
                        title="Client-Side Encryption"
                        description="Your file is split into chunks and encrypted with AES-256-GCM. The filename is also encrypted. All encryption happens in your browser - we only receive encrypted data."
                    />
                    <StepCard
                        number="3"
                        title="Secure Storage"
                        description="Encrypted chunks are uploaded to our storage. Without the key, this data is indistinguishable from random noise. We cannot decrypt it."
                    />
                    <StepCard
                        number="4"
                        title="Key in URL Fragment"
                        description="The encryption key is placed in the URL fragment (#). URL fragments are never sent to servers - they stay in the browser. Only people with the full link can decrypt."
                    />
                    <StepCard
                        number="5"
                        title="Recipient Decryption"
                        description="When someone opens your link, their browser extracts the key from the URL fragment, downloads the encrypted data, and decrypts it locally."
                    />
                </div>
            </section>

            {/* What We CAN'T Do */}
            <section className="space-y-8">
                <h2 className="text-3xl font-serif font-medium text-center">What We Cannot Do</h2>
                <p className="text-center text-muted-foreground max-w-2xl mx-auto">
                    Our architecture means there are things that are literally impossible for us, even if compelled.
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                    <Card className="border-red-500/20 bg-red-500/5">
                        <CardContent className="pt-6 flex gap-4">
                            <Eye className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="font-medium">Read your files</p>
                                <p className="text-sm text-muted-foreground">Files are encrypted with keys we don&apos;t have</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="border-red-500/20 bg-red-500/5">
                        <CardContent className="pt-6 flex gap-4">
                            <Eye className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="font-medium">See file names</p>
                                <p className="text-sm text-muted-foreground">Even filenames are encrypted</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="border-red-500/20 bg-red-500/5">
                        <CardContent className="pt-6 flex gap-4">
                            <Eye className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="font-medium">Read PGP-encrypted emails</p>
                                <p className="text-sm text-muted-foreground">Encrypted with your public key</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="border-red-500/20 bg-red-500/5">
                        <CardContent className="pt-6 flex gap-4">
                            <Eye className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="font-medium">Recover lost keys</p>
                                <p className="text-sm text-muted-foreground">No key escrow means no recovery</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </section>

            {/* Claim Transparency */}
            <ClaimTransparencySection />

            {/* Open Source */}
            <section className="space-y-8">
                <div className="text-center space-y-4">
                    <div className="p-4 w-fit mx-auto rounded-2xl bg-primary/10 text-primary">
                        <Code className="h-8 w-8" />
                    </div>
                    <h2 className="text-3xl font-serif font-medium">Open Source Security</h2>
                    <p className="text-muted-foreground max-w-2xl mx-auto">
                        Don&apos;t trust us—verify us. Our public application code is open source on Codeberg so researchers can inspect the implementation directly. Hosted infrastructure and the separate mail stack still need to be trusted and audited on their own terms.
                    </p>
                </div>
                <div className="flex flex-col sm:flex-row justify-center gap-4">
                    <Button asChild size="lg" variant="outline" className="rounded-full">
                        <Link href="https://codeberg.org/anonli">
                            <FileCode className="mr-2 h-5 w-5" />
                            View on Codeberg
                        </Link>
                    </Button>
                    <Button asChild size="lg" variant="outline" className="rounded-full">
                        <Link href="mailto:security@anon.li">
                            <Shield className="mr-2 h-5 w-5" />
                            Report a Vulnerability
                        </Link>
                    </Button>
                </div>
            </section>

            {/* CTA */}
            <section className="rounded-3xl bg-primary text-primary-foreground p-8 md:p-12 text-center space-y-6">
                <h2 className="text-3xl font-serif font-medium">Questions About Security?</h2>
                <p className="opacity-90 max-w-xl mx-auto">
                    We&apos;re happy to explain our security architecture in detail and review specific trust-boundary questions.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <Button asChild size="lg" variant="secondary" className="rounded-full">
                        <Link href="mailto:security@anon.li">
                            Contact Security Team
                        </Link>
                    </Button>
                    <Button asChild size="lg" variant="outline" className="rounded-full border-primary-foreground/20 bg-primary-foreground/30 hover:bg-primary-foreground/10">
                        <Link href="/faq">
                            View FAQ <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                </div>
            </section>
        </div>
    )
}

function StepCard({ number, title, description }: { number: string; title: string; description: string }) {
    return (
        <div className="flex gap-6 p-6 rounded-2xl border border-border/40 bg-background">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-serif font-medium">
                {number}
            </div>
            <div className="space-y-1">
                <h3 className="text-lg font-medium">{title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
            </div>
        </div>
    )
}

function ClaimTransparencySection() {
    const highlightedClaims = getClaimsByIds([
        "drop_zero_knowledge",
        "drop_client_side_encryption",
        "alias_no_email_storage",
        "alias_zero_tracking",
        "open_source",
        "logs_auto_deleted",
    ])
    const verifiedClaims = getClaimsByClass("verified_in_repo")
    const infraClaims = getClaimsByClass("depends_on_external_infra")

    return (
        <section className="space-y-8">
            <div className="text-center space-y-4">
                <h2 className="text-3xl font-serif font-medium">Claim Transparency</h2>
                <p className="text-muted-foreground max-w-2xl mx-auto">
                    We classify every security claim by how it can be verified. Some are backed by published source across our app and mail repositories. A smaller set still depends on runtime infrastructure you must trust separately.
                </p>
            </div>

            <ClaimCards claims={highlightedClaims} />

            <div className="grid gap-6 rounded-[2rem] border border-border/40 bg-secondary/20 p-6 md:grid-cols-2 md:p-8">
                <div className="space-y-4">
                    <h3 className="font-medium flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        Verified in source
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        {verifiedClaims.length} claims are directly tied to published source files across the web app and mail stack, including Drop encryption, reply-by-alias flows, PGP forwarding, 2FA, and download-limit enforcement.
                    </p>
                </div>

                <div className="space-y-4">
                    <h3 className="font-medium flex items-center gap-2">
                        <Info className="h-5 w-5 text-blue-600" />
                        Depends on deployed systems
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        {infraClaims.length} claims still rely on runtime infrastructure, such as log retention policy and whether the hosted deployment exactly matches the published source.
                    </p>
                </div>
            </div>
        </section>
    )
}
