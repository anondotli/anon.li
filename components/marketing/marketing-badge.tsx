import Link from "next/link"
import { cn } from "@/lib/utils"

interface MarketingBadgeProps {
    /** Optional link target. External URLs open in a new tab. */
    href?: string
    children: React.ReactNode
    className?: string
}

// The small pill above a hero headline. Deliberately calm: a static dot, no
// pulse, so it reads as a label rather than a notification.
export function MarketingBadge({ href, children, className }: MarketingBadgeProps) {
    const classes = cn(
        "inline-flex items-center rounded-full border border-primary/10 bg-background px-4 py-1.5 text-sm font-medium",
        href && "transition-colors hover:border-primary/30",
        className,
    )

    const inner = (
        <>
            <span className="mr-2 h-1.5 w-1.5 rounded-full bg-primary" />
            <span className="tracking-wide text-primary/80">{children}</span>
        </>
    )

    if (!href) {
        return <span className={classes}>{inner}</span>
    }

    const isExternal = href.startsWith("http")
    return (
        <Link
            href={href}
            className={classes}
            {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
            {inner}
        </Link>
    )
}
