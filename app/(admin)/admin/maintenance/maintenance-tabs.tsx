"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const tabs = [
    { label: "Storage Cleanup", href: "/admin/maintenance/storage" },
    { label: "Deletion Retries", href: "/admin/maintenance/deletion" },
]

export function MaintenanceTabs() {
    const pathname = usePathname()

    return (
        <div className="flex gap-1 border-b">
            {tabs.map((tab) => {
                const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`)
                return (
                    <Link
                        key={tab.href}
                        href={tab.href}
                        className={cn(
                            "px-4 py-2 text-sm border-b-2 -mb-px transition-colors",
                            active
                                ? "border-primary text-foreground font-medium"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {tab.label}
                    </Link>
                )
            })}
        </div>
    )
}
