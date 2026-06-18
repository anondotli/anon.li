import Link from "next/link"
import { CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"

export interface HeroTrustItem {
    label: string
    /** When set, the item links here (e.g. "/security"); otherwise renders as static text. */
    href?: string
}

/**
 * Shared trust-indicator row used by every marketing hero (home + product pages)
 * so they all share one visual treatment. Keep this the single source of truth
 * for hero trust-row styling.
 */
export function HeroTrustBar({ items, className }: { items: HeroTrustItem[]; className?: string }) {
    return (
        <div
            className={cn(
                "flex flex-wrap justify-center gap-x-8 gap-y-3 font-medium text-foreground/50 uppercase tracking-widest text-xs",
                className
            )}
        >
            {items.map((item) => {
                const content = (
                    <>
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        <span>{item.label}</span>
                    </>
                )
                return item.href ? (
                    <Link
                        key={item.label}
                        href={item.href}
                        className="flex items-center gap-3 hover:text-foreground/70 transition-colors"
                    >
                        {content}
                    </Link>
                ) : (
                    <div key={item.label} className="flex items-center gap-3">
                        {content}
                    </div>
                )
            })}
        </div>
    )
}
