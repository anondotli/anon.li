"use client"

import { forwardRef, useImperativeHandle, useRef, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { FieldPresentation } from "./types"
import {
    getAddressParts,
    enabledAddressParts,
    ADDRESS_PART_META,
    type FormField,
    type AddressValue,
    type AddressPart,
} from "@/lib/form-schema"

interface AddressHandle {
    focus: () => void
}

interface Props {
    field: Extract<FormField, { type: "address" }>
    value: unknown
    onChange: (next: unknown) => void
    onAdvance?: () => void
    presentation: FieldPresentation
    disabled?: boolean
    autoFocus?: boolean
}

function asAddress(value: unknown): AddressValue {
    if (value && typeof value === "object" && !Array.isArray(value)) return value as AddressValue
    return {}
}

export const AddressField = forwardRef<AddressHandle, Props>(function AddressField(
    { field, value, onChange, presentation, disabled, autoFocus },
    ref,
) {
    const firstRef = useRef<HTMLInputElement>(null)
    useImperativeHandle(ref, () => ({ focus: () => firstRef.current?.focus() }), [])
    useEffect(() => {
        if (autoFocus) {
            const id = window.setTimeout(() => firstRef.current?.focus(), 60)
            return () => window.clearTimeout(id)
        }
    }, [autoFocus])

    const parts = getAddressParts(field)
    const enabled = enabledAddressParts(parts)
    const addr = asAddress(value)
    const set = (part: AddressPart, next: string) => {
        onChange({ ...addr, [part]: next })
    }

    const spotlight = presentation === "spotlight"
    const inputClass = cn(spotlight && "h-12 text-base")

    const firstPart = enabled[0]
    const lineParts = enabled.filter((part) => part === "line1" || part === "line2")
    const gridParts = enabled.filter((part) => part !== "line1" && part !== "line2")

    const renderInput = (part: AddressPart) => {
        const meta = ADDRESS_PART_META[part]
        const isFirst = part === firstPart
        const partRequired = parts[part].required
        const value = addr[part] ?? ""
        return (
            <div key={part} className="relative">
                <Input
                    ref={isFirst ? firstRef : undefined}
                    id={isFirst ? field.id : undefined}
                    value={value}
                    onChange={(e) => set(part, e.target.value)}
                    aria-label={partRequired ? `${meta.label} (required)` : meta.label}
                    aria-required={partRequired || undefined}
                    autoComplete={meta.autoComplete}
                    disabled={disabled}
                    className={inputClass}
                />
                {/* Custom placeholder so the required star can be tinted red. */}
                {value === "" ? (
                    <span
                        className={cn(
                            "pointer-events-none absolute inset-y-0 left-3 right-3 flex items-center text-base text-muted-foreground md:text-sm",
                            disabled && "opacity-50",
                        )}
                    >
                        <span className="truncate">{meta.label}</span>
                        {partRequired ? <span className="text-destructive">*</span> : null}
                    </span>
                ) : null}
            </div>
        )
    }

    return (
        <div className={cn("space-y-2", spotlight && "max-w-xl")}>
            {lineParts.map(renderInput)}
            {gridParts.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2">{gridParts.map(renderInput)}</div>
            ) : null}
        </div>
    )
})
