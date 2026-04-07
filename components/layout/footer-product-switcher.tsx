"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Icons } from "@/components/shared/icons"
import { ChevronDown } from "lucide-react"
import { productOptions } from "@/config/navigation"
import { cn } from "@/lib/utils"
import { getProductContext, siteConfig } from "@/config/site"

export function FooterProductSwitcher() {
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
    )
}
