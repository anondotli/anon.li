import Link from "next/link"
import { ExternalLink } from "lucide-react"
import { ModeToggle } from "@/components/shared/mode-toggle"
import { FooterProductSwitcher } from "./footer-product-switcher"

export function SiteFooter() {
    return (
        <footer className="w-full border-t border-border/40 bg-background/50 backdrop-blur-md">
            <div className="container mx-auto px-6 py-12">
                <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
                    {/* Brand */}
                    <div className="space-y-4">
                        <FooterProductSwitcher />
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            Privacy-first platform. Anonymous email aliases and end-to-end encrypted file sharing.
                        </p>
                        <ModeToggle />
                    </div>

                    {/* Products */}
                    <div className="space-y-4">
                        <span className="font-medium block">Products</span>
                        <ul className="space-y-2.5 text-sm text-muted-foreground">
                            <li>
                                <Link href="/alias" className="hover:text-foreground transition-colors">Email Aliases</Link>
                            </li>
                            <li>
                                <Link href="/drop" className="hover:text-foreground transition-colors">File Sharing</Link>
                            </li>
                            <li>
                                <Link href="/cli" className="hover:text-foreground transition-colors">CLI</Link>
                            </li>
                            <li>
                                <Link href="/extension" className="hover:text-foreground transition-colors">Browser Extension</Link>
                            </li>
                            <li>
                                <Link href="/drop/upload" className="hover:text-foreground transition-colors">Upload a File</Link>
                            </li>
                            <li>
                                <Link href="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
                            </li>
                        </ul>
                    </div>

                    {/* Company */}
                    <div className="space-y-4">
                        <span className="font-medium block">Company</span>
                        <ul className="space-y-2.5 text-sm text-muted-foreground">
                            <li>
                                <Link href="/about" className="hover:text-foreground transition-colors">About</Link>
                            </li>
                            <li>
                                <Link href="/security" className="hover:text-foreground transition-colors">Security</Link>
                            </li>
                            <li>
                                <Link href="/blog" className="hover:text-foreground transition-colors">Blog</Link>
                            </li>
                            <li>
                                <Link href="/faq" className="hover:text-foreground transition-colors">FAQ</Link>
                            </li>
                            <li>
                                <Link href="/warrant-canary" className="hover:text-foreground transition-colors">Warrant Canary</Link>
                            </li>
                        </ul>
                    </div>

                    {/* Resources */}
                    <div className="space-y-4">
                        <span className="font-medium block">Resources</span>
                        <ul className="space-y-2.5 text-sm text-muted-foreground">
                            <li>
                                <Link href="/docs" className="hover:text-foreground transition-colors">Documentation</Link>
                            </li>
                            <li>
                                <Link href="/docs/api" className="hover:text-foreground transition-colors">API</Link>
                            </li>
                            <li>
                                <Link href="/compare" className="hover:text-foreground transition-colors">Compare</Link>
                            </li>
                            <li>
                                <a
                                    href="https://codeberg.org/anonli/anon.li"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="hover:text-foreground transition-colors inline-flex items-center gap-1"
                                >
                                    Codeberg
                                    <ExternalLink className="h-3 w-3" />
                                </a>
                            </li>
                            <li>
                                <Link href="/report" className="hover:text-foreground transition-colors">Report Abuse</Link>
                            </li>
                        </ul>
                    </div>
                </div>

                {/* Bottom */}
                <div className="mt-8 pt-6 border-t border-border/40 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
                    <p>&copy; 2026 anon.li. All rights reserved.</p>
                    <div className="flex gap-6">
                        <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
                        <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
                        <Link href="/docs/legal/aup" className="hover:text-foreground transition-colors">AUP</Link>
                        <Link href="/docs/legal/dmca" className="hover:text-foreground transition-colors">DMCA</Link>
                    </div>
                </div>
            </div>
        </footer>
    )
}
