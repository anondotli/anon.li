"use client"

import { forwardRef, useImperativeHandle, useRef, useEffect } from "react"
import { Star } from "lucide-react"
import { cn } from "@/lib/utils"
import type { FieldPresentation } from "./types"
import type { FormField } from "@/lib/form-schema"

export interface RatingHandle {
    focus: () => void
}

interface Props {
    field: Extract<FormField, { type: "rating" }>
    value: unknown
    onChange: (next: unknown) => void
    onAdvance?: () => void
    presentation: FieldPresentation
    disabled?: boolean
    autoFocus?: boolean
}

export const RatingField = forwardRef<RatingHandle, Props>(function RatingField(
    { field, value, onChange, onAdvance, presentation, disabled, autoFocus },
    ref,
) {
    const containerRef = useRef<HTMLDivElement>(null)
    useImperativeHandle(ref, () => ({ focus: () => containerRef.current?.focus() }), [])
    useEffect(() => {
        if (autoFocus) containerRef.current?.focus()
    }, [autoFocus])

    const current = typeof value === "number" ? value : 0
    const max = field.max
    const useStars = max <= 5
    const spotlight = presentation === "spotlight"

    const pick = (n: number) => {
        onChange(n)
        if (onAdvance) window.setTimeout(onAdvance, 220)
    }

    return (
        <div ref={containerRef} tabIndex={-1} className="space-y-3 outline-none">
            <div
                className={cn(
                    "flex flex-wrap gap-2",
                    spotlight && "gap-2.5",
                )}
                role="radiogroup"
                aria-label={field.label}
            >
                {Array.from({ length: max }, (_, i) => i + 1).map((n) => {
                    const active = n <= current
                    return useStars ? (
                        <button
                            key={n}
                            type="button"
                            role="radio"
                            aria-checked={n === current}
                            aria-label={`${n} star${n === 1 ? "" : "s"}`}
                            disabled={disabled}
                            onClick={() => pick(n)}
                            className={cn(
                                "rounded-lg p-1.5 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 disabled:opacity-50",
                            )}
                        >
                            <Star
                                className={cn(
                                    "transition-colors",
                                    spotlight ? "h-10 w-10" : "h-7 w-7",
                                    active ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40",
                                )}
                            />
                        </button>
                    ) : (
                        <button
                            key={n}
                            type="button"
                            role="radio"
                            aria-checked={n === current}
                            aria-label={`Rate ${n} of ${max}`}
                            disabled={disabled}
                            onClick={() => pick(n)}
                            data-selected={n === current}
                            className={cn(
                                "flex shrink-0 items-center justify-center rounded-lg border-2 border-border/50 bg-background/60 font-mono font-medium transition-all",
                                "hover:border-foreground/40 hover:bg-secondary/40",
                                "focus-visible:border-foreground focus-visible:outline-none",
                                "data-[selected=true]:border-foreground data-[selected=true]:bg-foreground data-[selected=true]:text-background",
                                "disabled:cursor-not-allowed disabled:opacity-60",
                                spotlight ? "h-12 w-12 text-base" : "h-10 w-10 text-sm",
                            )}
                        >
                            {n}
                        </button>
                    )
                })}
            </div>
            {!useStars ? (
                <div className={cn("flex justify-between text-xs text-muted-foreground", spotlight && "max-w-md")}>
                    <span>1 — least</span>
                    <span>{max} — most</span>
                </div>
            ) : null}
        </div>
    )
})
