import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

interface EmptyStateProps {
    icon: LucideIcon
    title: string
    description?: string
    action?: ReactNode
    /** "plain" = bare centered block (default). "panel" = dashed bordered surface. */
    variant?: "plain" | "panel"
    className?: string
}

export function EmptyState({
    icon: Icon,
    title,
    description,
    action,
    variant = "plain",
    className,
}: EmptyStateProps) {
    if (variant === "panel") {
        return (
            <div
                className={cn(
                    "flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-secondary/10 px-6 py-16 text-center",
                    className,
                )}
            >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border/60 bg-background">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <h3 className="font-serif text-2xl font-medium tracking-tight">{title}</h3>
                {description ? (
                    <p className="mx-auto mt-2 max-w-sm text-sm font-light leading-relaxed text-muted-foreground">
                        {description}
                    </p>
                ) : null}
                {action ? <div className="mt-6">{action}</div> : null}
            </div>
        )
    }

    return (
        <div className={cn("flex flex-col items-center justify-center py-16 text-center", className)}>
            <div className="rounded-full bg-secondary/50 p-4 mb-4">
                <Icon className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-medium font-serif mb-2">{title}</h3>
            {description && (
                <p className="text-muted-foreground text-sm max-w-sm mb-6">{description}</p>
            )}
            {action}
        </div>
    )
}
