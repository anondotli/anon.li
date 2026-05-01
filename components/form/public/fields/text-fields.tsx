import { forwardRef, useImperativeHandle, useRef, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { FieldPresentation } from "./types"
import { asString } from "./types"
import type { FormField } from "@/lib/form-schema"

const SPOTLIGHT_INPUT =
    "h-14 rounded-none border-0 border-b-2 border-border/50 bg-transparent px-0 text-2xl shadow-none placeholder:text-muted-foreground/40 focus-visible:border-foreground focus-visible:ring-0 sm:h-16 sm:text-3xl"

const SPOTLIGHT_TEXTAREA =
    "min-h-[8rem] rounded-none border-0 border-b-2 border-border/50 bg-transparent px-0 py-2 text-xl leading-relaxed shadow-none placeholder:text-muted-foreground/40 focus-visible:border-foreground focus-visible:ring-0 resize-none"

interface SingleLineProps {
    field: Extract<FormField, { type: "short_text" | "email" | "number" | "phone" | "date" }>
    value: unknown
    onChange: (next: unknown) => void
    onAdvance?: () => void
    presentation: FieldPresentation
    disabled?: boolean
    autoFocus?: boolean
}

export interface FieldHandle {
    focus: () => void
}

const useFocusBridge = (ref: React.RefObject<{ focus: () => void } | null> | undefined, autoFocus?: boolean) => {
    const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
    useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), [])
    useEffect(() => {
        if (autoFocus) {
            const id = window.setTimeout(() => inputRef.current?.focus(), 60)
            return () => window.clearTimeout(id)
        }
    }, [autoFocus])
    return inputRef
}

function classFor(type: SingleLineProps["field"]["type"], presentation: FieldPresentation): string | undefined {
    if (presentation !== "spotlight") return undefined
    if (type === "date") return cn(SPOTLIGHT_INPUT, "[&::-webkit-calendar-picker-indicator]:opacity-60")
    return SPOTLIGHT_INPUT
}

function placeholderFor(field: SingleLineProps["field"]): string | undefined {
    if (field.type === "email") return "placeholder" in field && field.placeholder ? field.placeholder : "you@example.com"
    if (field.type === "phone") return "placeholder" in field && field.placeholder ? field.placeholder : "+1 555 123 4567"
    if ("placeholder" in field && field.placeholder) return field.placeholder
    return undefined
}

export const SingleLineField = forwardRef<FieldHandle, SingleLineProps>(function SingleLineField(
    { field, value, onChange, onAdvance, presentation, disabled, autoFocus },
    ref,
) {
    const inputRef = useFocusBridge(ref as React.RefObject<{ focus: () => void } | null>, autoFocus)

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            onAdvance?.()
        }
    }

    const inputType =
        field.type === "email" ? "email" :
        field.type === "number" ? "number" :
        field.type === "phone" ? "tel" :
        field.type === "date" ? "date" :
        "text"

    return (
        <Input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            id={field.id}
            type={inputType}
            inputMode={field.type === "number" ? "decimal" : field.type === "phone" ? "tel" : undefined}
            value={asString(value)}
            onChange={(e) => {
                if (field.type === "number") {
                    onChange(e.target.value === "" ? "" : Number(e.target.value))
                } else {
                    onChange(e.target.value)
                }
            }}
            onKeyDown={onKeyDown}
            placeholder={placeholderFor(field)}
            disabled={disabled}
            maxLength={"maxLength" in field ? field.maxLength : undefined}
            min={field.type === "number" || field.type === "date" ? field.min : undefined}
            max={field.type === "number" || field.type === "date" ? field.max : undefined}
            step={field.type === "number" ? field.step : undefined}
            autoComplete="off"
            className={classFor(field.type, presentation)}
        />
    )
})

interface LongTextProps extends Omit<SingleLineProps, "field"> {
    field: Extract<FormField, { type: "long_text" }>
}

export const LongTextField = forwardRef<FieldHandle, LongTextProps>(function LongTextField(
    { field, value, onChange, onAdvance, presentation, disabled, autoFocus },
    ref,
) {
    const inputRef = useFocusBridge(ref as React.RefObject<{ focus: () => void } | null>, autoFocus)

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Cmd/Ctrl+Enter advances; plain Enter inserts newline (default behavior).
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            onAdvance?.()
        }
    }

    return (
        <Textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            id={field.id}
            value={asString(value)}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={field.placeholder}
            maxLength={field.maxLength}
            disabled={disabled}
            rows={presentation === "spotlight" ? 4 : 3}
            className={presentation === "spotlight" ? SPOTLIGHT_TEXTAREA : undefined}
        />
    )
})
