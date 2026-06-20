import {
    LayoutDashboard,
    LineChart,
    Users,
    Building2,
    FileBox,
    ClipboardList,
    Mail,
    Flag,
    Globe,
    Inbox,
    Key,
    KeyRound,
    ShieldX,
    Settings,
    ScrollText,
    CreditCard,
    Gift,
    Wrench,
    type LucideIcon,
} from "lucide-react"

interface NavItem {
    title: string
    href: string
    icon: LucideIcon
    /** Extra keywords to help the command palette match this item. */
    keywords?: string[]
}

export interface NavGroup {
    title: string
    items: NavItem[]
    defaultOpen?: boolean
}

/**
 * Single source of truth for admin navigation. Consumed by both the sidebar
 * (`AdminNav`) and the command palette (`AdminCommandPalette`) so the two never
 * drift apart.
 */
export const navGroups: NavGroup[] = [
    {
        title: "OVERVIEW",
        defaultOpen: true,
        items: [
            { title: "Dashboard", href: "/admin", icon: LayoutDashboard, keywords: ["home", "overview"] },
            { title: "Analytics", href: "/admin/analytics", icon: LineChart, keywords: ["charts", "metrics", "revenue", "growth", "mrr"] },
        ],
    },
    {
        title: "PEOPLE",
        defaultOpen: true,
        items: [
            { title: "Users", href: "/admin/users", icon: Users, keywords: ["accounts", "members", "ban"] },
            { title: "Organizations", href: "/admin/organizations", icon: Building2, keywords: ["teams", "b2b", "orgs"] },
            { title: "Referrals", href: "/admin/referrals", icon: Gift },
        ],
    },
    {
        title: "ALIAS",
        defaultOpen: true,
        items: [
            { title: "Aliases", href: "/admin/aliases", icon: Mail, keywords: ["email", "forwarding"] },
            { title: "Recipients", href: "/admin/recipients", icon: Inbox },
            { title: "Domains", href: "/admin/domains", icon: Globe, keywords: ["dns", "dkim"] },
        ],
    },
    {
        title: "SHARING",
        defaultOpen: true,
        items: [
            { title: "Drops", href: "/admin/drops", icon: FileBox, keywords: ["files", "transfers"] },
            { title: "Forms", href: "/admin/forms", icon: ClipboardList, keywords: ["submissions"] },
        ],
    },
    {
        title: "MODERATION",
        defaultOpen: true,
        items: [
            { title: "Abuse Reports", href: "/admin/reports", icon: Flag, keywords: ["complaints", "flags"] },
            { title: "Takedowns", href: "/admin/takedowns", icon: ShieldX },
        ],
    },
    {
        title: "SYSTEM",
        defaultOpen: true,
        items: [
            { title: "Billing", href: "/admin/billing", icon: CreditCard, keywords: ["subscriptions", "payments", "stripe", "crypto"] },
            { title: "API Keys", href: "/admin/api-keys", icon: Key },
            { title: "OAuth Apps", href: "/admin/oauth", icon: KeyRound, keywords: ["mcp", "clients", "applications"] },
            { title: "Maintenance", href: "/admin/maintenance", icon: Wrench, keywords: ["storage", "cleanup", "deletion"] },
            { title: "Audit Logs", href: "/admin/audit", icon: ScrollText, keywords: ["history", "actions"] },
            { title: "Settings", href: "/admin/settings", icon: Settings, keywords: ["reserved aliases"] },
        ],
    },
]

/** True when `pathname` should highlight `href` as active in the nav. */
export function isNavItemActive(pathname: string, href: string): boolean {
    return pathname === href || (href !== "/admin" && pathname.startsWith(href))
}
