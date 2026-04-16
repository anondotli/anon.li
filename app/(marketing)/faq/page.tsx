import type { Metadata } from "next"
import Link from "next/link"
import { siteConfig } from "@/config/site"
import { Button } from "@/components/ui/button"
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion"
import { Mail, FileUp, Shield, HelpCircle, ArrowRight, Terminal } from "lucide-react"

export const metadata: Metadata = {
    title: siteConfig.faq.metadata?.title,
    description: siteConfig.faq.metadata?.description,
    openGraph: {
        title: siteConfig.faq.metadata?.title as string,
        description: siteConfig.faq.metadata?.description,
        url: siteConfig.faq.url,
        type: "website",
    },
    alternates: {
        canonical: siteConfig.faq.url,
    }
}

export default function FAQPage() {
    return (
        <div className="container max-w-4xl py-16 md:py-24 space-y-16">
            {/* Hero */}
            <section className="text-center space-y-6">
                <div className="inline-flex items-center rounded-full border border-primary/10 bg-primary/5 px-4 py-1.5 text-sm">
                    <HelpCircle className="mr-2 h-4 w-4 text-primary" />
                    <span className="text-primary/80">Help Center</span>
                </div>
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif font-medium tracking-tight">
                    Frequently Asked Questions
                </h1>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                    Everything you need to know about anon.li&apos;s email aliases and encrypted file sharing.
                </p>
            </section>

            {/* General Questions */}
            <section className="space-y-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                        <Shield className="h-5 w-5" />
                    </div>
                    <h2 className="text-2xl font-serif font-medium">General</h2>
                </div>
                <Accordion type="single" collapsible className="space-y-3">
                    <FAQItem value="what-is-anonli" question="What is anon.li?">
                        anon.li is a privacy platform with two core services: private email aliases (anon.li Alias) and end-to-end encrypted file sharing (anon.li Drop). Alias forwards email in real time without storing message content, while Drop is client-side encrypted so we never receive the plaintext files or keys. You can use them through the web dashboard, the <a href="/cli" className="text-primary hover:underline">CLI tool</a>, the <a href="/extension" className="text-primary hover:underline">browser extension</a>, or the REST API.
                    </FAQItem>
                    <FAQItem value="is-free" question="Is anon.li free?">
                        Yes! We offer generous free tiers for both services. Free accounts include email aliases and file uploads with reasonable limits. Paid plans unlock higher limits, longer expiry times, and advanced features like custom domains and custom encryption keys.
                    </FAQItem>
                    <FAQItem value="open-source" question="Is anon.li open source?">
                        Our public application code is open source on Codeberg. You can audit the web app and companion repositories, but the hosted service and separate mail stack still depend on deployment and infrastructure you must trust independently.
                    </FAQItem>
                    <FAQItem value="data-location" question="Where is my data stored?">
                        We rely on infrastructure and subprocessors across the European Union, the United States, and global edge networks. For file sharing, only encrypted Drop data is stored with our storage provider. See our <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a> for the current processor list and locations.
                    </FAQItem>
                </Accordion>
            </section>

            {/* Alias Questions */}
            <section className="space-y-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                        <Mail className="h-5 w-5" />
                    </div>
                    <h2 className="text-2xl font-medium">anon.li <span className="font-serif">Alias</span></h2>
                </div>
                <Accordion type="single" collapsible className="space-y-3">
                    <FAQItem value="what-is-alias" question="What is an email alias?">
                        An email alias is a unique email address (like random123@anon.li) that forwards messages to your real inbox. Create aliases to sign up for services without exposing your real email. Free users get 10 random aliases and 1 custom alias, Plus gets 100 random and 10 custom aliases, and Pro gets unlimited random aliases plus 100 custom aliases.
                    </FAQItem>
                    <FAQItem value="reply-alias" question="Can I reply from an alias?">
                        Yes! When you reply to a forwarded email, your response is automatically sent through your alias. The recipient sees your alias address, never your real email.
                    </FAQItem>
                    <FAQItem value="spam-blocking" question="How does spam blocking work?">
                        You can disable any alias with one click. When disabled, all emails to that alias are rejected. This is perfect for when a service starts spamming you - just turn off that alias instead of dealing with unsubscribe links.
                    </FAQItem>
                    <FAQItem value="custom-domain" question="Can I use my own domain?">
                        Yes, paid plans include custom domain support. You can use addresses like anything@yourdomain.com that forward to your inbox. This is great for professional use or personal branding.
                    </FAQItem>
                    <FAQItem value="pgp-encryption" question="What is PGP encryption?">
                        PGP (Pretty Good Privacy) is an encryption standard. If you add a PGP public key to a verified recipient, we&apos;ll encrypt forwarded copies for aliases routed to that recipient before delivery. Standard forwarding still requires transient server-side processing, but the delivered message is encrypted to your key.
                    </FAQItem>
                    <FAQItem value="email-storage" question="Do you store my emails?">
                        Alias forwarding is designed for real-time processing rather than storing message content at rest. That behavior depends on our separate mail infrastructure, not just this web app repository. With PGP enabled, the forwarded copy is encrypted to your key before delivery.
                    </FAQItem>
                </Accordion>
            </section>

            {/* Drop Questions */}
            <section className="space-y-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                        <FileUp className="h-5 w-5" />
                    </div>
                    <h2 className="text-2xl font-medium">anon.li <span className="font-serif">Drop</span></h2>
                </div>
                <Accordion type="single" collapsible className="space-y-3">
                    <FAQItem value="how-encryption-works" question="How does the encryption work?">
                        When you upload a file, your browser generates a random encryption key and encrypts the file locally using AES-256-GCM. Only the encrypted data is sent to our servers. The key is included in the share link&apos;s URL fragment (#), which is never sent to our servers.
                    </FAQItem>
                    <FAQItem value="can-you-see-files" question="Can you see my files?">
                        No. We only receive encrypted data. Without the encryption key (which stays in your browser and share link), the data is indistinguishable from random noise. Even filenames are encrypted.
                    </FAQItem>
                    <FAQItem value="need-account" question="Do I need an account to share files?">
                        Yes. You need a free account to upload and manage drops. Recipients can still download with only the shared link and never need an account.
                    </FAQItem>
                    <FAQItem value="file-expiry" question="How long do files stay available?">
                        It depends on your plan. Free accounts get up to 3 days, Plus gets 7 days, and Pro gets 30 days. After expiry, files are automatically deleted from our servers.
                    </FAQItem>
                    <FAQItem value="download-limits" question="What are download limits?">
                        You can set a maximum number of downloads for any file. Once the limit is reached, the file is automatically deleted. Perfect for sharing sensitive documents that should only be accessed a specific number of times.
                    </FAQItem>
                    <FAQItem value="revoke-link" question="Can I revoke a share link?">
                        Yes! From your dashboard, you can disable any drop&apos;s download link at any time. You can also re-enable it later if needed. This gives you full control over who can access your shared files.
                    </FAQItem>
                    <FAQItem value="password-protection" question="Can I password-protect files?">
                        Yes! Plus and Pro users can set a custom encryption key (password) on their files. The recipient will need both the link and the password to decrypt. For extra security, we recommend sending the password & the file link through different channels.
                    </FAQItem>
                    <FAQItem value="lost-link" question="What if I lose my share link?">
                        The dashboard can rebuild full links for link-only drops after you unlock your vault. Password-protected drops still require the password you set. Forgotten vault passwords or lost custom passwords remain unrecoverable because we do not have your decrypted keys.
                    </FAQItem>
                    <FAQItem value="file-size" question="What's the maximum file size?">
                        Your max file size equals your remaining bandwidth. Free users get 5GB bandwidth, Plus gets 50GB, and Pro gets 250GB. We support chunked uploads, so large files upload reliably even on slower connections.
                    </FAQItem>
                </Accordion>
            </section>

            {/* API & Tools Questions */}
            <section className="space-y-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                        <Terminal className="h-5 w-5" />
                    </div>
                    <h2 className="text-2xl font-serif font-medium">API & Tools</h2>
                </div>
                <Accordion type="single" collapsible className="space-y-3">
                    <FAQItem value="cli-tool" question="Is there a CLI tool?">
                        Yes! Our CLI lets you manage aliases, drops, domains, and recipients directly from the terminal. Install it from the <a href="/cli" className="text-primary hover:underline">/cli</a> page. It supports all major operations including creating aliases, uploading encrypted files, and managing your subscription.
                    </FAQItem>
                    <FAQItem value="browser-extension" question="Is there a browser extension?">
                        Yes. The <a href="/extension" className="text-primary hover:underline">anon.li browser extension</a> can be installed through Firefox & Chrome web stores today or manually from our Codeberg repositories. It lets you create aliases with one click while browsing, manage your drops, and share files with a QR code without leaving the current tab.
                    </FAQItem>
                    <FAQItem value="api-access" question="Do you offer an API?">
                        Yes! We provide a REST API for aliases, recipients, domains, and drops. API-key requests count against monthly API quotas: Free accounts get 500 requests/month, Plus gets 25,000, and Pro gets 100,000. Generate and revoke API keys from your dashboard with your signed-in session.
                    </FAQItem>
                </Accordion>
            </section>

            {/* Security Questions */}
            <section className="space-y-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                        <Shield className="h-5 w-5" />
                    </div>
                    <h2 className="text-2xl font-serif font-medium">Security & Privacy</h2>
                </div>
                <Accordion type="single" collapsible className="space-y-3">
                    <FAQItem value="zero-knowledge" question="What does 'zero knowledge' mean?">
                        For anon.li, zero knowledge applies to Drop: files are encrypted client-side, and the keys never reach our servers. Alias has a different trust model: emails are processed transiently for forwarding to your inbox, with optional PGP encryption for the forwarded copy.
                    </FAQItem>
                    <FAQItem value="law-enforcement" question="What if law enforcement requests my data?">
                        For file sharing, we can only provide encrypted Drop data without the decryption key. For Alias, we do not run a hosted mailbox, but standard forwarding still processes messages transiently in order to deliver them. With PGP enabled, the forwarded copy in your inbox is encrypted to your public key. Our architecture limits what data exists at rest.
                    </FAQItem>
                    <FAQItem value="trust-verification" question="How can I verify your security claims?">
                        Start with our public source code and security documentation. We label which claims are backed by published source across the web app and mail stack, and which ones still depend on runtime infrastructure like log retention or the hosted build matching the published source.
                    </FAQItem>
                    <FAQItem value="two-factor-auth" question="Do you support two-factor authentication (2FA)?">
                        Yes! You can enable TOTP-based two-factor authentication from your account settings. Use any authenticator app (Google Authenticator, Authy, 1Password, etc.) for an extra layer of security on top of your normal sign-in flow.
                    </FAQItem>
                    <FAQItem value="data-export" question="Can I export my data?">
                        Yes. You can export your account data from your dashboard settings. We also support full account deletion, which permanently removes all your data including aliases, drops, and domains.
                    </FAQItem>
                    <FAQItem value="anonymous-payments" question="Can I pay anonymously?">
                        We support cryptocurrency checkout through NOWPayments. The exact coins and networks available depend on NOWPayments at checkout, and crypto purchases activate 1 year of access per payment with no recurring billing.
                    </FAQItem>
                </Accordion>
            </section>

            {/* CTA */}
            <section className="rounded-3xl bg-secondary/30 p-8 md:p-12 text-center space-y-6">
                <h2 className="text-2xl font-serif font-medium">Still Have Questions?</h2>
                <p className="text-muted-foreground max-w-xl mx-auto">
                    Check our documentation for detailed guides, or reach out to our support team. We&apos;re happy to help.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <Button asChild size="lg" className="rounded-full">
                        <Link href="/docs">
                            Read the Docs <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                    <Button asChild size="lg" variant="outline" className="rounded-full">
                        <Link href="mailto:hi@anon.li">
                            Contact Support
                        </Link>
                    </Button>
                </div>
            </section>
        </div>
    )
}

function FAQItem({ value, question, children }: { value: string; question: string; children: React.ReactNode }) {
    return (
        <AccordionItem value={value} className="border border-border/40 rounded-xl px-6 data-[state=open]:bg-secondary/30">
            <AccordionTrigger className="text-left hover:no-underline py-5">
                <span className="font-medium">{question}</span>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground pb-5 leading-relaxed">
                {children}
            </AccordionContent>
        </AccordionItem>
    )
}
