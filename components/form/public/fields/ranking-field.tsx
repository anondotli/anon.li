"use client"

import { forwardRef, useImperativeHandle, useRef, useEffect, useState } from "react"
import { ChevronUp, ChevronDown, GripVertical } from "lucide-react"
import { cn } from "@/lib/utils"
import type { FieldPresentation } from "./types"
import type { FormField } from "@/lib/form-schema"

interface RankingHandle {
    focus: () => void
}

interface Props {
    field: Extract<FormField, { type: "ranking" }>
    value: unknown
    onChange: (next: unknown) => void
    onAdvance?: () => void
    presentation: FieldPresentation
    disabled?: boolean
    autoFocus?: boolean
}

// Build a stable full permutation of `options` from a possibly partial/stale value.
function normalizeOrder(value: unknown, options: string[]): string[] {
    if (Array.isArray(value)) {
        const valid: string[] = []
        const seen = new Set<string>()
        for (const v of value) {
            if (typeof v === "string" && options.includes(v) && !seen.has(v)) {
                seen.add(v)
                valid.push(v)
            }
        }
        const missing = options.filter((o) => !seen.has(o))
        return [...valid, ...missing]
    }
    return options.slice()
}

function isFullOrder(value: unknown, options: string[]): boolean {
    if (!Array.isArray(value) || value.length !== options.length) return false
    const set = new Set(value)
    return set.size === options.length && options.every((o) => set.has(o))
}

export const RankingField = forwardRef<RankingHandle, Props>(function RankingField(
    { field, value, onChange, presentation, disabled, autoFocus },
    ref,
) {
    const containerRef = useRef<HTMLDivElement>(null)
    useImperativeHandle(ref, () => ({ focus: () => containerRef.current?.focus() }), [])
    useEffect(() => {
        if (autoFocus) containerRef.current?.focus()
    }, [autoFocus])

    // Seed the answer with the displayed order once, so an untouched ranking is
    // still a valid (complete) answer when the form is submitted.
    const seeded = useRef(false)
    useEffect(() => {
        if (seeded.current) return
        seeded.current = true
        if (!isFullOrder(value, field.options)) {
            onChange(normalizeOrder(value, field.options))
        }
        // Run once on mount; subsequent reorders flow through `move`.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const order = normalizeOrder(value, field.options)
    const [dragIndex, setDragIndex] = useState<number | null>(null)

    const commit = (next: string[]) => onChange(next)

    const move = (from: number, to: number) => {
        if (from === to || to < 0 || to >= order.length) return
        const next = order.slice()
        const [item] = next.splice(from, 1)
        if (item === undefined) return
        next.splice(to, 0, item)
        commit(next)
    }

    const spotlight = presentation === "spotlight"

    return (
        <div ref={containerRef} tabIndex={-1} className="space-y-2 outline-none" role="list" aria-label={field.label}>
            {order.map((option, index) => (
                <div
                    key={option}
                    role="listitem"
                    draggable={!disabled}
                    onDragStart={(event) => {
                        if (disabled) return
                        setDragIndex(index)
                        event.dataTransfer.effectAllowed = "move"
                    }}
                    onDragOver={(event) => {
                        if (disabled || dragIndex === null) return
                        event.preventDefault()
                        event.dataTransfer.dropEffect = "move"
                    }}
                    onDrop={(event) => {
                        event.preventDefault()
                        if (dragIndex !== null) move(dragIndex, index)
                        setDragIndex(null)
                    }}
                    onDragEnd={() => setDragIndex(null)}
                    className={cn(
                        "flex items-center gap-3 rounded-xl border-2 border-border/50 bg-background/60 px-3 py-2.5 transition-all",
                        "hover:border-foreground/30",
                        dragIndex === index && "opacity-40",
                        spotlight && "px-4 py-3",
                    )}
                >
                    <span
                        className={cn(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-foreground/30 bg-foreground/5 font-mono text-xs font-medium tabular-nums text-foreground",
                            spotlight && "h-8 w-8 text-sm",
                        )}
                        aria-hidden
                    >
                        {index + 1}
                    </span>
                    <span className={cn("min-w-0 flex-1 truncate text-sm", spotlight && "text-base sm:text-lg")}>
                        {option}
                    </span>
                    <div className="flex shrink-0 items-center gap-0.5">
                        <button
                            type="button"
                            onClick={() => move(index, index - 1)}
                            disabled={disabled || index === 0}
                            aria-label={`Move ${option} up`}
                            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                            <ChevronUp className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => move(index, index + 1)}
                            disabled={disabled || index === order.length - 1}
                            aria-label={`Move ${option} down`}
                            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                            <ChevronDown className="h-4 w-4" />
                        </button>
                        <span
                            className="hidden cursor-grab items-center text-muted-foreground/40 active:cursor-grabbing sm:flex"
                            aria-hidden
                        >
                            <GripVertical className="h-4 w-4" />
                        </span>
                    </div>
                </div>
            ))}
        </div>
    )
})
