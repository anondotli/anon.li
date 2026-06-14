"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Mail, Globe, Settings, CreditCard, FileUp, BarChart3, ClipboardList, Users } from "lucide-react"
import { authClient } from "@/lib/auth-client"

export function DashboardNav({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
    const pathname = usePathname()
    // Only surface "Team" while a team context is actually selected — the page
    // shows the *active* org's console, so in personal context (even for org
    // members) the link would dead-end on the "no team selected" state.
    // Selecting a team via the header org-switcher makes it appear.
    const { data: activeOrg } = authClient.useActiveOrganization()
    const teamSelected = Boolean(activeOrg)

    const mainItems = [
        { href: "/dashboard/alias", title: "Aliases", icon: <Mail className="mr-2 h-4 w-4" /> },
        { href: "/dashboard/drop", title: "Drops", icon: <FileUp className="mr-2 h-4 w-4" /> },
        { href: "/dashboard/form", title: "Forms", icon: <ClipboardList className="mr-2 h-4 w-4" /> },
    ]

    const manageItems = [
        ...(teamSelected ? [{ href: "/dashboard/team", title: "Team", icon: <Users className="mr-2 h-4 w-4" /> }] : []),
        { href: "/dashboard/domains", title: "Domains", icon: <Globe className="mr-2 h-4 w-4" /> },
        { href: "/dashboard/usage", title: "Usage", icon: <BarChart3 className="mr-2 h-4 w-4" /> },
        { href: "/dashboard/billing", title: "Billing", icon: <CreditCard className="mr-2 h-4 w-4" /> },
        { href: "/dashboard/settings", title: "Settings", icon: <Settings className="mr-2 h-4 w-4" /> },
    ]

    return (
        <nav className={cn("flex flex-col space-y-1", className)} {...props}>
            {mainItems.map((item) => (
                <Button
                    key={item.href}
                    asChild
                    variant={pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href + "/")) ? "secondary" : "ghost"}
                    className="justify-start"
                >
                    <Link href={item.href}>
                        {item.icon}
                        {item.title}
                    </Link>
                </Button>
            ))}

            <div className="py-3" />

            <p className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Manage</p>
            {manageItems.map((item) => (
                <Button
                    key={item.href}
                    asChild
                    variant={pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href + "/")) ? "secondary" : "ghost"}
                    className="justify-start"
                >
                    <Link href={item.href}>
                        {item.icon}
                        {item.title}
                    </Link>
                </Button>
            ))}
        </nav>
    )
}