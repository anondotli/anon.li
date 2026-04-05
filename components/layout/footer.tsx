"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Icons } from "@/components/shared/icons"
import { ModeToggle } from "@/components/shared/mode-toggle"
import { ExternalLink, ChevronDown } from "lucide-react"
import { productOptions } from "@/config/navigation"
import { cn } from "@/lib/utils"
import { getProductContext, siteConfig } from "@/config/site"

export function SiteFooter() {
    const pathname = usePathname()
    const product = getProductContext(pathname)
    const config = siteConfig[product]
    const [open, setOpen] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) return
        function handleClick(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener("mousedown", handleClick)
        return () => document.removeEventListener("mousedown", handleClick)
    }, [open])

    return (
        <footer className="w-full border-t border-border/40 bg-background/50 backdrop-blur-md">
            <div className="container mx-auto px-6 py-12">
                <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
                    {/* Brand */}
                    <div className="space-y-4">
                        <div className="relative" ref={dropdownRef}>
                            <button
                                type="button"
                                onClick={() => setOpen((v) => !v)}
                                className="cursor-pointer bg-transparent h-auto p-0 hover:bg-transparent focus:bg-transparent inline-flex items-center gap-2"
                            >
                                <div className="p-1.5 rounded-lg bg-primary/10">
                                    <Icons.logo className="h-5 w-5 text-primary" />
                                </div>
                                <span className="font-bold text-lg">
                                    anon.li{config.productName && <span> {config.productName}</span>}
                                </span>
                                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
                            </button>
                            {open && (
                                <div className="absolute left-0 bottom-full mb-1.5 z-50">
                                    <ul className="rounded-md border bg-popover text-popover-foreground shadow-lg w-[280px] p-2">
                                        {productOptions.map((option) => {
                                            const Icon = option.icon;
                                            return (
                                                <li key={option.id}>
                                                    <Link
                                                        href={option.href}
                                                        onClick={() => setOpen(false)}
                                                        className={cn(
                                                            "flex items-center gap-3 select-none rounded-lg p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
                                                        )}
                                                    >
                                                        <div className="p-2 rounded-lg bg-muted">
                                                            <Icon className="h-4 w-4" />
                                                        </div>
                                                        <div className="flex-1">
                                                            <div className="text-sm font-medium">
                                                                {option.id === "default" ? "anon.li" : `anon.li ${option.name}`}
                                                            </div>
                                                            <p className="text-xs text-muted-foreground">{option.tagline}</p>
                                                        </div>
                                                    </Link>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            )}
                        </div>
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
                                    href="https://github.com/anondotli/mx"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="hover:text-foreground transition-colors inline-flex items-center gap-1"
                                >
                                    GitHub
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
                    <p>© 2026 anon.li. All rights reserved.</p>
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