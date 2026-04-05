"use client"

import Link from "next/link"
import { ChevronRight, Menu, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useState } from "react"
import { Button } from "@/components/ui/button"

interface SidebarSection {
    title: string
    items: {
        title: string
        href: string
        matchPath?: string
    }[]
}

interface DocsSidebarProps {
    sections: SidebarSection[]
    currentPath: string
}

interface SidebarContentProps {
    sections: SidebarSection[]
    currentPath: string
    onMobileClose?: () => void
}

function SidebarContent({ sections, currentPath, onMobileClose }: SidebarContentProps) {
    const isActive = (href: string) => href === currentPath

    return (
        <nav className="space-y-8">
            {sections.map((section) => (
                <div key={section.title}>
                    <h3 className="font-medium text-sm uppercase tracking-wider text-muted-foreground mb-3 px-3">
                        {section.title}
                    </h3>
                    <ul className="space-y-1">
                        {section.items.map((item) => (
                            <li key={item.href}>
                                <Link
                                    href={item.href}
                                    onClick={onMobileClose}
                                    className={cn(
                                        "flex items-center px-3 py-2 text-sm rounded-lg transition-all duration-200",
                                        isActive(item.href)
                                            ? "bg-primary/10 text-primary font-medium"
                                            : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                                    )}
                                >
                                    {isActive(item.href) && (
                                        <ChevronRight className="h-3.5 w-3.5 mr-1.5 text-primary" />
                                    )}
                                    <span className={cn(!isActive(item.href) && "ml-5")}>
                                        {item.title}
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>
            ))}

            <div className="pt-4 border-t border-border/40">
                <Link
                    href="/docs"
                    className="flex items-center px-3 py-2 text-sm text-muted-foreground hover:bg-secondary/60 hover:text-foreground rounded-lg transition-colors"
                >
                    ← All Documentation
                </Link>
            </div>
        </nav>
    )
}

export function DocsSidebar({ sections, currentPath }: DocsSidebarProps) {
    const [mobileOpen, setMobileOpen] = useState(false)

    return (
        <>
            {/* Mobile toggle */}
            <div className="md:hidden mb-4">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setMobileOpen(!mobileOpen)}
                    className="w-full justify-between"
                >
                    <span>Documentation Menu</span>
                    {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                </Button>
            </div>

            {/* Mobile sidebar */}
            {mobileOpen && (
                <div className="md:hidden mb-6 p-4 rounded-xl border border-border/40 bg-card/50 backdrop-blur-sm">
                    <SidebarContent
                        sections={sections}
                        currentPath={currentPath}
                        onMobileClose={() => setMobileOpen(false)}
                    />
                </div>
            )}

            {/* Desktop sidebar */}
            <aside className="hidden md:block w-64 shrink-0">
                <div className="sticky top-24 pr-4">
                    <SidebarContent
                        sections={sections}
                        currentPath={currentPath}
                    />
                </div>
            </aside>
        </>
    )
}
