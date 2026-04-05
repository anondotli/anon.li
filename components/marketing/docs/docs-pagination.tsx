import Link from "next/link"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface DocsPaginationProps {
    prev?: {
        title: string
        href: string
    }
    next?: {
        title: string
        href: string
    }
}

export function DocsPagination({ prev, next }: DocsPaginationProps) {
    if (!prev && !next) return null

    return (
        <nav className="mt-16 pt-8 border-t border-border/40 grid gap-4 sm:grid-cols-2">
            {prev ? (
                <Link
                    href={prev.href}
                    className={cn(
                        "group flex flex-col items-start gap-1 rounded-xl border border-border/40 p-4 transition-all duration-200",
                        "hover:bg-secondary/30 hover:border-border/60"
                    )}
                >
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <ArrowLeft className="h-3 w-3 transition-transform group-hover:-translate-x-1" />
                        Previous
                    </span>
                    <span className="font-medium text-sm group-hover:text-primary transition-colors">
                        {prev.title}
                    </span>
                </Link>
            ) : (
                <div />
            )}

            {next && (
                <Link
                    href={next.href}
                    className={cn(
                        "group flex flex-col items-end gap-1 rounded-xl border border-border/40 p-4 transition-all duration-200",
                        "hover:bg-secondary/30 hover:border-border/60",
                        !prev && "sm:col-start-2"
                    )}
                >
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        Next
                        <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
                    </span>
                    <span className="font-medium text-sm group-hover:text-primary transition-colors">
                        {next.title}
                    </span>
                </Link>
            )}
        </nav>
    )
}
