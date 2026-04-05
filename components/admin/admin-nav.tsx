"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { cn } from "@/lib/utils"
import {
    LayoutDashboard,
    Users,
    FileBox,
    Mail,
    Flag,
    Globe,
    Inbox,
    Key,
    ShieldX,
    Settings,
    ChevronDown,
    ChevronRight,
    type LucideIcon
} from "lucide-react"

interface NavItem {
    title: string
    href: string
    icon: LucideIcon
}

interface NavGroup {
    title: string
    items: NavItem[]
    defaultOpen?: boolean
}

const navGroups: NavGroup[] = [
    {
        title: "OVERVIEW",
        defaultOpen: true,
        items: [
            { title: "Dashboard", href: "/admin", icon: LayoutDashboard },
        ]
    },
    {
        title: "USERS",
        defaultOpen: true,
        items: [
            { title: "All Users", href: "/admin/users", icon: Users },
        ]
    },
    {
        title: "ALIAS SERVICE",
        defaultOpen: true,
        items: [
            { title: "Aliases", href: "/admin/aliases", icon: Mail },
            { title: "Recipients", href: "/admin/recipients", icon: Inbox },
            { title: "Domains", href: "/admin/domains", icon: Globe },
        ]
    },
    {
        title: "DROP SERVICE",
        defaultOpen: true,
        items: [
            { title: "Drops", href: "/admin/drops", icon: FileBox },
        ]
    },
    {
        title: "MODERATION",
        defaultOpen: true,
        items: [
            { title: "Abuse Reports", href: "/admin/reports", icon: Flag },
            { title: "Takedowns", href: "/admin/takedowns", icon: ShieldX },
        ]
    },
    {
        title: "SYSTEM",
        defaultOpen: true,
        items: [
            { title: "API Keys", href: "/admin/api-keys", icon: Key },
            { title: "Settings", href: "/admin/settings", icon: Settings },
        ]
    },
]

function AdminNavGroup({ group }: { group: NavGroup }) {
    const pathname = usePathname()
    const [isOpen, setIsOpen] = useState(group.defaultOpen ?? true)

    const hasActiveItem = group.items.some(
        item => pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href))
    )

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
                        const isActive = pathname === item.href ||
                            (item.href !== "/admin" && pathname.startsWith(item.href))

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                                    isActive
                                        ? "bg-destructive/10 text-destructive font-medium"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                )}
                            >
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
