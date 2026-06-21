"use client"

import { forwardRef, useImperativeHandle, useRef, useEffect } from "react"
import { cn } from "@/lib/utils"
import type { FieldPresentation } from "./types"
import type { FormField } from "@/lib/form-schema"

interface LinearScaleHandle {
    focus: () => void
}

interface Props {
    field: Extract<FormField, { type: "linear_scale" }>
    value: unknown
    onChange: (next: unknown) => void
    onAdvance?: () => void
    presentation: FieldPresentation
    disabled?: boolean
    autoFocus?: boolean
}

export const LinearScaleField = forwardRef<LinearScaleHandle, Props>(function LinearScaleField(
    { field, value, onChange, onAdvance, presentation, disabled, autoFocus },
    ref,
) {
    const containerRef = useRef<HTMLDivElement>(null)
    useImperativeHandle(ref, () => ({ focus: () => containerRef.current?.focus() }), [])
    useEffect(() => {
        if (autoFocus) containerRef.current?.focus()
    }, [autoFocus])

    const current = typeof value === "number" ? value : null
    const spotlight = presentation === "spotlight"
    const steps = Array.from({ length: field.max - field.min + 1 }, (_, i) => field.min + i)

    const pick = (n: number) => {
        onChange(n)
        if (onAdvance) window.setTimeout(onAdvance, 220)
    }

    return (
        <div ref={containerRef} tabIndex={-1} className="space-y-3 outline-none">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={field.label}>
                {steps.map((n) => {
                    const selected = n === current
                    return (
                        <button
                            key={n}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            aria-label={`Rate ${n} of ${field.max}`}
                            disabled={disabled}
                            onClick={() => pick(n)}
                            data-selected={selected}
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
            {field.minLabel || field.maxLabel ? (
                <div className={cn("flex justify-between gap-3 text-xs text-muted-foreground", spotlight && "max-w-md")}>
                    <span>{field.minLabel}</span>
                    <span>{field.maxLabel}</span>
                </div>
            ) : null}
        </div>
    )
})
