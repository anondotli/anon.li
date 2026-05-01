"use client"

import { useEffect, useMemo, useRef } from "react"
import type { FormField, FormSchemaDoc } from "@/lib/form-schema"
import { isFieldVisible } from "@/lib/form-schema"
import { FieldInput } from "./fields"
import { cn } from "@/lib/utils"
import { AlertCircle } from "lucide-react"

interface Props {
    schema: FormSchemaDoc
    answers: Record<string, unknown>
    onChange: (next: Record<string, unknown>) => void
    fieldErrors?: Record<string, string>
    disabled?: boolean
    title: string
    description?: string | null
    /** Slot rendered below all fields (Turnstile + submit button + privacy hint). */
    footer: React.ReactNode
}

export function ClassicFlow({
    schema,
    answers,
    onChange,
    fieldErrors,
    disabled,
    title,
    description,
    footer,
}: Props) {
    const visibleFields = useMemo(
        () => schema.fields.filter((f) => isFieldVisible(f, answers)),
        [schema.fields, answers],
    )
    const visibleIdsRef = useRef<Set<string>>(new Set(visibleFields.map((f) => f.id)))

    useEffect(() => {
        const next = new Set(visibleFields.map((f) => f.id))
        const removed: string[] = []
        for (const f of schema.fields) {
            if (visibleIdsRef.current.has(f.id) && !next.has(f.id) && answers[f.id] !== undefined) {
                removed.push(f.id)
            }
        }
        visibleIdsRef.current = next
        if (removed.length > 0) {
            const copy = { ...answers }
            for (const id of removed) delete copy[id]
            onChange(copy)
        }
    }, [visibleFields, schema.fields, answers, onChange])

    const setAnswer = (id: string, value: unknown) => onChange({ ...answers, [id]: value })

    return (
        <div className="mx-auto flex w-full max-w-2xl flex-col px-1 py-20 sm:py-28">
            <header className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                <h1 className="font-serif font-medium leading-[1.05] tracking-tight text-4xl sm:text-6xl">
                    {title}
                </h1>
                {description ? (
                    <p className="mt-6 max-w-xl whitespace-pre-wrap text-base text-muted-foreground sm:text-lg">
                        {description}
                    </p>
                ) : null}
                {visibleFields.length > 0 ? (
                    <div className="mt-8 flex items-center gap-4">
                        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/80">
                            {visibleFields.length} {visibleFields.length === 1 ? "question" : "questions"}
                        </span>
                        <span className="h-px flex-1 bg-border/50" />
                    </div>
                ) : null}
            </header>

            <div className="mt-12 space-y-12 animate-in fade-in slide-in-from-bottom-6 duration-700 sm:space-y-14">
                {visibleFields.length === 0 ? (
                    <p className="py-8 text-center font-serif text-2xl text-muted-foreground">
                        This form has no questions yet.
                    </p>
                ) : (
                    visibleFields.map((field, idx) => (
                        <ClassicField
                            key={field.id}
                            field={field}
                            index={idx + 1}
                            value={answers[field.id]}
                            onChange={(v) => setAnswer(field.id, v)}
                            error={fieldErrors?.[field.id]}
                            disabled={disabled}
                        />
                    ))
                )}
            </div>

            <div className="mt-14">{footer}</div>
        </div>
    )
}

interface ClassicFieldProps {
    field: FormField
    index: number
    value: unknown
    onChange: (next: unknown) => void
    error?: string
    disabled?: boolean
}

function ClassicField({ field, index, value, onChange, error, disabled }: ClassicFieldProps) {
    return (
        <div
            data-field-id={field.id}
            className={cn(
                "scroll-mt-24 transition-colors",
                error && "animate-in fade-in",
            )}
        >
            <div className="flex items-baseline gap-3">
                <span className="select-none font-mono text-[11px] tabular-nums tracking-wider text-muted-foreground/60">
                    {String(index).padStart(2, "0")}
                </span>
                <label
                    htmlFor={field.id}
                    className="font-serif text-xl font-medium leading-snug tracking-tight sm:text-2xl"
                >
                    {field.label}
                    {field.required ? (
                        <span className="ml-1.5 text-base text-destructive/80" aria-hidden>
                            *
                        </span>
                    ) : null}
                </label>
            </div>
            {field.helpText ? (
                <p className="ml-7 mt-2 text-sm leading-relaxed text-muted-foreground">
                    {field.helpText}
                </p>
            ) : null}
            <div className="ml-7 mt-4">
                <FieldInput
                    field={field}
                    value={value}
                    onChange={onChange}
                    presentation="compact"
                    disabled={disabled}
                />
                {error ? (
                    <div
                        role="alert"
                        className="mt-3 inline-flex items-center gap-2 rounded-full border border-destructive/30 bg-destructive/5 px-3 py-1 text-xs text-destructive"
                    >
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        <span>{error}</span>
                    </div>
                ) : null}
            </div>
        </div>
    )
}
