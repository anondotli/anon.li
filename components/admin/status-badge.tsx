import { cva, type VariantProps } from "class-variance-authority"
import { type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Standardized status pill for admin tables and detail heroes. Replaces the
 * ad-hoc `bg-*-500/10` badge classes scattered across the admin UI. Tones map
 * to the app's semantic tokens (success/warning/destructive) plus neutral.
 */
const statusBadgeVariants = cva(
    "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
    {
        variants: {
            tone: {
                neutral: "border-border bg-muted text-muted-foreground",
                success: "border-[hsl(var(--success))]/25 bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]",
                warning: "border-[hsl(var(--warning))]/25 bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]",
                danger: "border-destructive/25 bg-destructive/10 text-destructive",
                info: "border-foreground/15 bg-foreground/5 text-foreground",
            },
        },
        defaultVariants: {
            tone: "neutral",
        },
    }
)

interface StatusBadgeProps extends VariantProps<typeof statusBadgeVariants> {
    label: string
    icon?: LucideIcon
    /** Render a leading dot instead of an icon. */
    dot?: boolean
    className?: string
}

export function StatusBadge({ label, icon: Icon, dot, tone, className }: StatusBadgeProps) {
    return (
        <span className={cn(statusBadgeVariants({ tone }), className)}>
            {Icon && <Icon className="h-3 w-3" />}
            {!Icon && dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
            {label}
        </span>
    )
}
