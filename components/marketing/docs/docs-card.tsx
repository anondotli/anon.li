import Link from "next/link"
import { ArrowRight, LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface DocsCardProps {
    title: string
    description?: string
    href: string
    icon?: LucideIcon
    className?: string
}

export function DocsCard({ title, description, href, icon: Icon, className }: DocsCardProps) {
    return (
        <Link
            href={href}
            className={cn(
                "group relative flex flex-col rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm p-6 transition-all duration-300",
                "hover:border-border/60 hover:bg-secondary/30 hover:shadow-lg",
                className
            )}
        >
            {/* Hover gradient */}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

            <div className="relative z-10 flex flex-col h-full">
                {Icon && (
                    <div className="mb-4 p-2.5 w-fit rounded-xl bg-primary/10 text-primary transition-colors duration-300 group-hover:bg-primary/15">
                        <Icon className="h-5 w-5" />
                    </div>
                )}

                <h3 className="font-serif text-lg font-medium mb-2 transition-colors group-hover:text-primary">
                    {title}
                </h3>

                {description && (
                    <p className="text-sm text-muted-foreground font-light leading-relaxed mb-4 line-clamp-2">
                        {description}
                    </p>
                )}

                <div className="mt-auto flex items-center gap-1.5 text-sm font-medium text-primary">
                    <span>Read guide</span>
                    <ArrowRight className="h-3.5 w-3.5 -translate-x-1 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
                </div>
            </div>
        </Link>
    )
}
