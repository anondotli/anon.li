import { cn } from "@/lib/utils"

interface StatProps {
    label: string
    value: number | string
    accent?: boolean
    size?: "sm" | "md" | "lg"
    /** Render inside a bordered, centered box (value above label) — for compact stat grids. */
    boxed?: boolean
    className?: string
}

const VALUE_SIZE = {
    sm: "text-xl",
    md: "text-2xl",
    lg: "text-3xl",
} as const

/** A single labelled metric with a monospace, tabular numeral. */
export function Stat({ label, value, accent, size = "lg", boxed, className }: StatProps) {
    const valueClass = cn(
        "font-mono font-medium tabular-nums tracking-tight",
        VALUE_SIZE[size],
        accent && "text-emerald-600 dark:text-emerald-400",
    )
    const labelClass = "text-[11px] uppercase tracking-wider text-muted-foreground"
    const display = typeof value === "number" ? value.toLocaleString() : value

    if (boxed) {
        return (
            <div
                className={cn(
                    "rounded-lg border border-border/40 bg-secondary/20 px-3 py-2.5 text-center",
                    className,
                )}
            >
                <p className={valueClass}>{display}</p>
                <p className={cn("mt-0.5", labelClass)}>{label}</p>
            </div>
        )
    }

    return (
        <div className={cn("space-y-1", className)}>
            <p className={labelClass}>{label}</p>
            <p className={valueClass}>{display}</p>
        </div>
    )
}
