"use client"

// Compatibility shim. The previous monolithic FormRenderer has been split into
// per-field components and two flow components (OneQuestionFlow, ClassicFlow)
// in ./fields and ./{one-question,classic}-flow. This shim is kept only so the
// builder preview panel keeps working until Part 2 rewires it directly.

import { useEffect, useMemo, useRef } from "react"
import type { FormSchemaDoc } from "@/lib/form-schema"
import { isFieldVisible } from "@/lib/form-schema"
import { FieldInput } from "./fields"
import { cn } from "@/lib/utils"

interface Props {
    schema: FormSchemaDoc
    answers: Record<string, unknown>
    onChange: (next: Record<string, unknown>) => void
    disabled?: boolean
}

export function FormRenderer({ schema, answers, onChange, disabled }: Props) {
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
        <div className="space-y-6">
            {schema.fields.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                    This form has no fields configured yet.
                </p>
            ) : (
                visibleFields.map((field) => (
                    <div key={field.id} className={cn("space-y-2")}>
                        <label htmlFor={field.id} className="block text-sm font-medium">
                            {field.label}
                            {field.required ? <span className="ml-1 text-destructive">*</span> : null}
                        </label>
                        {field.helpText ? (
                            <p className="text-xs text-muted-foreground">{field.helpText}</p>
                        ) : null}
                        <FieldInput
                            field={field}
                            value={answers[field.id]}
                            onChange={(v) => setAnswer(field.id, v)}
                            presentation="compact"
                            disabled={disabled}
                        />
                    </div>
                ))
            )}
        </div>
    )
}
