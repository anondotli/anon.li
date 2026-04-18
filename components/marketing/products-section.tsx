import Link from "next/link"
import {
    BarChart3,
    Code2,
    FileKey,
    FileUp,
    Fingerprint,
    Globe,
    Key,
    KeyRound,
    Lock,
    Mail,
    MessageSquareReply,
    Puzzle,
    QrCode,
    Shield,
    Terminal,
    Users,
} from "lucide-react"
import { DROP_PRO_LIMIT_LABELS } from "@/config/features"

export function ProductsSection() {
    return (
        <section id="products" className="w-full py-12 md:py-20 bg-secondary/30 relative">
            <div className="container mx-auto px-6 relative z-10">
                <div className="text-center mb-8 md:mb-14 space-y-4">
                    <h2 className="text-3xl md:text-4xl font-serif font-medium tracking-tight">Two core products, one privacy layer</h2>
                    <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto font-light">
                        Alias protects your inbox identity. Drop protects the files you share. Automation and power tools sit underneath both.
                    </p>
                </div>

                <div className="grid gap-8 lg:grid-cols-2">
                    {/* Alias Product Card */}
                    <Link href="/alias" className="group relative p-5 md:p-8 rounded-2xl bg-background border border-border/80 hover:border-primary/20 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 flex flex-col lg:mt-8">
                        <div className="flex items-center gap-4 mb-5">
                            <div className="p-3 rounded-xl bg-secondary text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                                <Mail className="h-6 w-6" />
                            </div>
                            <div>
                                <h3 className="text-xl md:text-2xl font-bold">anon.li Alias</h3>
                                <p className="text-sm text-muted-foreground">Private Email Aliases</p>
                            </div>
                        </div>
                        <p className="text-muted-foreground leading-relaxed font-light text-base mb-5">
                            Generate a different email identity for every site, forward to verified inboxes, reply privately, and shut down spam without changing your real address.
                        </p>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Mail className="h-4 w-4 text-primary" />
                                <span>Random & Custom Aliases</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <MessageSquareReply className="h-4 w-4 text-primary" />
                                <span>Reply by Alias</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Globe className="h-4 w-4 text-primary" />
                                <span>Custom Domains + DKIM</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Key className="h-4 w-4 text-primary" />
                                <span>Optional PGP Forwarding</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Users className="h-4 w-4 text-primary" />
                                <span>Verified Recipients</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Fingerprint className="h-4 w-4 text-primary" />
                                <span>Encrypted Labels</span>
                            </div>
                        </div>
                    </Link>

                    {/* Drop Product Card */}
                    <Link href="/drop" className="group relative p-5 md:p-8 rounded-2xl bg-background border border-border/80 hover:border-primary/20 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 flex flex-col lg:mt-8">
                        <div className="flex items-center gap-4 mb-5">
                            <div className="p-3 rounded-xl bg-secondary text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                                <FileUp className="h-6 w-6" />
                            </div>
                            <div>
                                <h3 className="text-xl md:text-2xl font-bold">anon.li Drop</h3>
                                <p className="text-sm text-muted-foreground">E2E Encrypted File Sharing</p>
                            </div>
                        </div>
                        <p className="text-muted-foreground leading-relaxed font-light text-base mb-5">
                            Encrypt files in your browser, share a link, and let recipients decrypt without an account. The dashboard keeps controls close to each drop.
                        </p>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Lock className="h-4 w-4 text-primary" />
                                <span>Browser-Side E2EE</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <FileUp className="h-4 w-4 text-primary" />
                                <span>{DROP_PRO_LIMIT_LABELS.maxFileSize}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <KeyRound className="h-4 w-4 text-primary" />
                                <span>Password Protection</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <FileKey className="h-4 w-4 text-primary" />
                                <span>Expiry + Download Limits</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <QrCode className="h-4 w-4 text-primary" />
                                <span>QR Sharing</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Shield className="h-4 w-4 text-primary" />
                                <span>Vault Key Recovery</span>
                            </div>
                        </div>
                    </Link>
                </div>

                {/* Tools strip */}
                <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Link href="/docs/api" className="group flex items-center gap-4 p-4 rounded-xl bg-background border border-border/80 hover:border-primary/20 transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
                        <div className="p-2.5 rounded-xl bg-secondary text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300 shrink-0">
                            <Code2 className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="font-semibold text-sm">REST API</p>
                            <p className="text-xs text-muted-foreground">Automate aliases, drops, domains, and recipients</p>
                        </div>
                    </Link>
                    <Link href="/cli" className="group flex items-center gap-4 p-4 rounded-xl bg-background border border-border/80 hover:border-primary/20 transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
                        <div className="p-2.5 rounded-xl bg-secondary text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300 shrink-0">
                            <Terminal className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="font-semibold text-sm">anon.li CLI</p>
                            <p className="text-xs text-muted-foreground">Manage aliases and drops from your terminal</p>
                        </div>
                    </Link>
                    <Link href="/extension" className="group flex items-center gap-4 p-4 rounded-xl bg-background border border-border/80 hover:border-primary/20 transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
                        <div className="p-2.5 rounded-xl bg-secondary text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300 shrink-0">
                            <Puzzle className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="font-semibold text-sm">Browser Extension</p>
                            <p className="text-xs text-muted-foreground">One-click aliases and drops for Firefox & Chrome</p>
                        </div>
                    </Link>
                    <Link href="/mcp" className="group flex items-center gap-4 p-4 rounded-xl bg-background border border-border/80 hover:border-primary/20 transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
                        <div className="p-2.5 rounded-xl bg-secondary text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300 shrink-0">
                            <BarChart3 className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="font-semibold text-sm">MCP Server</p>
                            <p className="text-xs text-muted-foreground">OAuth access for AI tools and agents</p>
                        </div>
                    </Link>
                </div>
            </div>
        </section>
    )
}
