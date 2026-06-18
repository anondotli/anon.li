import Link from "next/link"
import { Fragment } from "react"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

export interface Crumb {
    label: string
    href?: string
}

interface BreadcrumbProps {
    items: Crumb[]
    className?: string
}

/**
 * Compact breadcrumb trail for admin pages. The last item is rendered as the
 * current page (no link). Replaces the ad-hoc "Back to X" links.
 */
export function Breadcrumb({ items, className }: BreadcrumbProps) {
    return (
        <nav aria-label="Breadcrumb" className={cn("flex items-center gap-1.5 text-sm text-muted-foreground", className)}>
            {items.map((item, i) => {
                const isLast = i === items.length - 1
                return (
                    <Fragment key={`${item.label}-${i}`}>
                        {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" />}
                        {item.href && !isLast ? (
                            <Link
                                href={item.href}
                                className="truncate transition-colors hover:text-foreground"
                            >
                                {item.label}
                            </Link>
                        ) : (
                            <span className={cn("truncate", isLast && "text-foreground font-medium")} aria-current={isLast ? "page" : undefined}>
                                {item.label}
                            </span>
                        )}
                    </Fragment>
                )
            })}
        </nav>
    )
}
