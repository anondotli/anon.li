"use client"

import { forwardRef, useImperativeHandle, useRef, useEffect } from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import type { FieldPresentation } from "./types"
import { indexToLetter } from "./letters"
import type { FormField } from "@/lib/form-schema"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { asString } from "./types"

export interface ChoiceHandle {
    focus: () => void
}

interface SingleSelectProps {
    field: Extract<FormField, { type: "single_select" }>
    value: unknown
    onChange: (next: unknown) => void
    onAdvance?: () => void
    presentation: FieldPresentation
    disabled?: boolean
    autoFocus?: boolean
}

export const SingleSelectField = forwardRef<ChoiceHandle, SingleSelectProps>(function SingleSelectField(
    { field, value, onChange, onAdvance, presentation, disabled, autoFocus },
    ref,
) {
    const containerRef = useRef<HTMLDivElement>(null)
    useImperativeHandle(ref, () => ({ focus: () => containerRef.current?.focus() }), [])
    useEffect(() => {
        if (autoFocus) containerRef.current?.focus()
    }, [autoFocus])

    const selected = asString(value)
    const handlePick = (opt: string) => {
        onChange(opt)
        // Slight delay so the selection animation is visible before advance.
        if (onAdvance) window.setTimeout(onAdvance, 220)
    }

    const spotlight = presentation === "spotlight"

    return (
        <div
            ref={containerRef}
            tabIndex={-1}
            role="radiogroup"
            aria-disabled={disabled}
            className={cn("space-y-2 outline-none", spotlight && "space-y-2.5")}
        >
            {field.options.map((opt, i) => {
                const isSelected = selected === opt
                const letter = indexToLetter(i)
                return (
                    <button
                        key={opt}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => handlePick(opt)}
                        disabled={disabled}
                        data-selected={isSelected}
                        className={cn(
                            "group flex w-full items-center gap-3 rounded-xl border-2 border-border/50 bg-background/60 px-4 py-3 text-left transition-all",
                            "hover:border-foreground/40 hover:bg-secondary/40",
                            "focus-visible:border-foreground focus-visible:outline-none",
                            "data-[selected=true]:border-foreground data-[selected=true]:bg-secondary/60",
                            "disabled:cursor-not-allowed disabled:opacity-60",
                            spotlight && "px-5 py-4",
                        )}
                    >
                        <span
                            className={cn(
                                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background font-mono text-xs font-medium uppercase text-muted-foreground transition-colors",
                                "group-data-[selected=true]:border-foreground group-data-[selected=true]:bg-foreground group-data-[selected=true]:text-background",
                                spotlight && "h-8 w-8 text-[11px]",
                            )}
                        >
                            {letter}
                        </span>
                        <span className={cn("flex-1 text-sm", spotlight && "text-base sm:text-lg")}>{opt}</span>
                        <span
                            className={cn(
                                "h-5 w-5 shrink-0 rounded-full border border-border/60 bg-background transition-colors",
                                "group-data-[selected=true]:border-foreground group-data-[selected=true]:bg-foreground",
                            )}
                        />
                    </button>
                )
            })}
        </div>
    )
})

interface MultiSelectProps {
    field: Extract<FormField, { type: "multi_select" }>
    value: unknown
    onChange: (next: unknown) => void
    presentation: FieldPresentation
    disabled?: boolean
    autoFocus?: boolean
}

export const MultiSelectField = forwardRef<ChoiceHandle, MultiSelectProps>(function MultiSelectField(
    { field, value, onChange, presentation, disabled, autoFocus },
    ref,
) {
    const containerRef = useRef<HTMLDivElement>(null)
    useImperativeHandle(ref, () => ({ focus: () => containerRef.current?.focus() }), [])
    useEffect(() => {
        if (autoFocus) containerRef.current?.focus()
    }, [autoFocus])

    const selected = Array.isArray(value) ? (value as string[]) : []
    const toggle = (opt: string) => {
        const next = selected.includes(opt) ? selected.filter((o) => o !== opt) : [...selected, opt]
        onChange(next)
    }

    const spotlight = presentation === "spotlight"

    return (
        <div
            ref={containerRef}
            tabIndex={-1}
            role="group"
            aria-disabled={disabled}
            className={cn("space-y-2 outline-none", spotlight && "space-y-2.5")}
        >
            {field.options.map((opt, i) => {
                const isSelected = selected.includes(opt)
                const letter = indexToLetter(i)
                return (
                    <button
                        key={opt}
                        type="button"
                        role="checkbox"
                        aria-checked={isSelected}
                        onClick={() => toggle(opt)}
                        disabled={disabled}
                        data-selected={isSelected}
                        className={cn(
                            "group flex w-full items-center gap-3 rounded-xl border-2 border-border/50 bg-background/60 px-4 py-3 text-left transition-all",
                            "hover:border-foreground/40 hover:bg-secondary/40",
                            "focus-visible:border-foreground focus-visible:outline-none",
                            "data-[selected=true]:border-foreground data-[selected=true]:bg-secondary/60",
                            "disabled:cursor-not-allowed disabled:opacity-60",
                            spotlight && "px-5 py-4",
                        )}
                    >
                        <span
                            className={cn(
                                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background font-mono text-xs font-medium uppercase text-muted-foreground transition-colors",
                                "group-data-[selected=true]:border-foreground group-data-[selected=true]:bg-foreground group-data-[selected=true]:text-background",
                                spotlight && "h-8 w-8 text-[11px]",
                            )}
                        >
                            {letter}
                        </span>
                        <span className={cn("flex-1 text-sm", spotlight && "text-base sm:text-lg")}>{opt}</span>
                        <span
                            className={cn(
                                "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 border-border/60 bg-background transition-colors",
                                "group-data-[selected=true]:border-foreground group-data-[selected=true]:bg-foreground",
                            )}
                        >
                            <Check
                                className={cn(
                                    "h-3 w-3 text-background transition-opacity",
                                    isSelected ? "opacity-100" : "opacity-0",
                                )}
                            />
                        </span>
                    </button>
                )
            })}
        </div>
    )
})

interface DropdownProps {
    field: Extract<FormField, { type: "dropdown" }>
    value: unknown
    onChange: (next: unknown) => void
    onAdvance?: () => void
    presentation: FieldPresentation
    disabled?: boolean
    autoFocus?: boolean
}

export const DropdownField = forwardRef<ChoiceHandle, DropdownProps>(function DropdownField(
    { field, value, onChange, presentation, disabled, autoFocus },
    ref,
) {
    const triggerRef = useRef<HTMLButtonElement>(null)
    useImperativeHandle(ref, () => ({ focus: () => triggerRef.current?.focus() }), [])
    useEffect(() => {
        if (autoFocus) triggerRef.current?.focus()
    }, [autoFocus])

    const spotlight = presentation === "spotlight"
    return (
        <Select value={asString(value)} onValueChange={onChange} disabled={disabled}>
            <SelectTrigger
                ref={triggerRef}
                id={field.id}
                className={cn(
                    spotlight && "h-14 rounded-xl border-2 border-border/50 bg-background/60 px-5 text-lg",
                )}
            >
                <SelectValue placeholder="Choose an option" />
            </SelectTrigger>
            <SelectContent>
                {field.options.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                        {opt}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
})
