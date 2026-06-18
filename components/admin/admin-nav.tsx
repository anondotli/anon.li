"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { ChevronDown, ChevronRight } from "lucide-react"
import { navGroups, isNavItemActive, type NavGroup } from "./nav-config"

function AdminNavGroup({ group }: { group: NavGroup }) {
    const pathname = usePathname()
    const [isOpen, setIsOpen] = useState(group.defaultOpen ?? true)

    const hasActiveItem = group.items.some((item) => isNavItemActive(pathname, item.href))

    return (
        <div className="mb-4">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider hover:text-muted-foreground transition-colors"
            >
                {isOpen ? (
                    <ChevronDown className="h-3 w-3" />
                ) : (
                    <ChevronRight className="h-3 w-3" />
                )}
                {group.title}
                {!isOpen && hasActiveItem && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-destructive" />
                )}
            </button>

            {isOpen && (
                <nav className="flex flex-col gap-0.5 mt-1">
                    {group.items.map((item) => {
                        const isActive = isNavItemActive(pathname, item.href)

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                aria-current={isActive ? "page" : undefined}
                                className={cn(
                                    "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                                    isActive
                                        ? "bg-destructive/10 text-destructive font-medium"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                )}
                            >
                                {isActive && (
                                    <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-destructive" />
                                )}
                                <item.icon className="h-4 w-4" />
                                {item.title}
                            </Link>
                        )
                    })}
                </nav>
            )}
        </div>
    )
}

export function AdminNav() {
    return (
        <div className="flex flex-col">
            {navGroups.map((group) => (
                <AdminNavGroup key={group.title} group={group} />
            ))}
        </div>
    )
}
