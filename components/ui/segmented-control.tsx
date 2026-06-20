"use client"

import { cn } from "@/lib/utils"

interface SegmentedItem<T extends string> {
    value: T
    label: string
    count?: number
}

interface SegmentedControlProps<T extends string> {
    items: SegmentedItem<T>[]
    value: T
    onChange: (value: T) => void
    size?: "sm" | "md"
    className?: string
    "aria-label"?: string
}

/**
 * Filter-style segmented control with optional counts. For switching between
 * data views (table/summary, build/preview/json) prefer the Tabs primitive —
 * this is for filtering a single view (All / Unread / Files, etc.).
 */
export function SegmentedControl<T extends string>({
    items,
    value,
    onChange,
    size = "md",
    className,
    "aria-label": ariaLabel,
}: SegmentedControlProps<T>) {
    return (
        <div
            role="group"
            aria-label={ariaLabel}
            className={cn(
                "inline-flex items-center gap-1 rounded-lg border border-border/60 bg-background p-1",
                className,
            )}
        >
            {items.map((item) => {
                const active = item.value === value
                return (
                    <button
                        key={item.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => onChange(item.value)}
                        className={cn(
                            "inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-sm",
                            active
                                ? "bg-secondary text-foreground"
                                : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {item.label}
                        {item.count !== undefined ? (
                            <span
                                className={cn(
                                    "ml-1.5 font-mono tabular-nums",
                                    active ? "opacity-70" : "opacity-60",
                                )}
                            >
                                {item.count}
                            </span>
                        ) : null}
                    </button>
                )
            })}
        </div>
    )
}
