"use client"

import { useEffect, useMemo, useRef } from "react"

import { isFieldVisible, type FormField, type FormSchemaDoc } from "@/lib/form-schema"

export function useVisibleFormFields(
    schema: FormSchemaDoc,
    answers: Record<string, unknown>,
    onAnswersChange: (next: Record<string, unknown>) => void,
): FormField[] {
    const visibleFields = useMemo(
        () => schema.fields.filter((field) => isFieldVisible(field, answers)),
        [schema.fields, answers],
    )
    const visibleIdsRef = useRef<Set<string>>(new Set(visibleFields.map((field) => field.id)))

    useEffect(() => {
        const nextVisibleIds = new Set(visibleFields.map((field) => field.id))
        const hiddenAnsweredIds = schema.fields
            .filter((field) => visibleIdsRef.current.has(field.id))
            .filter((field) => !nextVisibleIds.has(field.id))
            .filter((field) => answers[field.id] !== undefined)
            .map((field) => field.id)

        visibleIdsRef.current = nextVisibleIds

        if (hiddenAnsweredIds.length === 0) return

        const nextAnswers = { ...answers }
        for (const id of hiddenAnsweredIds) {
            delete nextAnswers[id]
        }
        onAnswersChange(nextAnswers)
    }, [visibleFields, schema.fields, answers, onAnswersChange])

    return visibleFields
}
