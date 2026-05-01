"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { FormField, FormSchemaDoc } from "@/lib/form-schema"
import { isFieldVisible } from "@/lib/form-schema"
import { QuestionFrame, type QuestionFrameHandle } from "./question-frame"
import { ProgressRail } from "./progress-rail"
import { getFieldBehavior, letterToIndex } from "./fields"

interface Props {
    schema: FormSchemaDoc
    answers: Record<string, unknown>
    onChange: (next: Record<string, unknown>) => void
    onSubmit: () => Promise<void> | void
    submitButtonText: string
    disabled?: boolean
    /** Render-prop slot below the question content (for Turnstile, errors, progress). */
    bottomSlot?: (ctx: { field: FormField; isLast: boolean }) => React.ReactNode
}

function isAnswerEmpty(value: unknown): boolean {
    return (
        value === undefined ||
        value === null ||
        value === "" ||
        (Array.isArray(value) && value.length === 0)
    )
}

function validateAnswer(field: FormField, value: unknown): string | null {
    if (isAnswerEmpty(value)) {
        return field.required ? "This question is required" : null
    }
    switch (field.type) {
        case "email":
            if (typeof value === "string" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                return "Enter a valid email address"
            }
            return null
        case "number":
            if (typeof value === "number") {
                if (field.min !== undefined && value < field.min) return `Must be at least ${field.min}`
                if (field.max !== undefined && value > field.max) return `Must be at most ${field.max}`
            }
            return null
        case "short_text":
        case "long_text":
            if ("maxLength" in field && field.maxLength && typeof value === "string" && value.length > field.maxLength) {
                return `Keep this under ${field.maxLength} characters`
            }
            return null
        default:
            return null
    }
}

export function OneQuestionFlow({
    schema,
    answers,
    onChange,
    onSubmit,
    submitButtonText,
    disabled,
    bottomSlot,
}: Props) {
    const visibleFields = useMemo(
        () => schema.fields.filter((f) => isFieldVisible(f, answers)),
        [schema.fields, answers],
    )
    const visibleIdsRef = useRef<Set<string>>(new Set(visibleFields.map((f) => f.id)))

    // When a field becomes hidden, drop its answer so stale data never leaks into the submission.
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

    const [step, setStep] = useState(0)
    const [error, setError] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const interactedStepsRef = useRef<Set<string>>(new Set())
    const frameRef = useRef<QuestionFrameHandle>(null)

    const clampedStep = Math.min(step, Math.max(0, visibleFields.length - 1))
    const current = visibleFields[clampedStep]
    const isLast = clampedStep === visibleFields.length - 1

    const setAnswer = useCallback(
        (id: string, value: unknown) => {
            interactedStepsRef.current.add(id)
            setError(null)
            onChange({ ...answers, [id]: value })
        },
        [answers, onChange],
    )

    const goBack = useCallback(() => {
        setError(null)
        setStep((s) => Math.max(0, s - 1))
    }, [])

    const goForward = useCallback(async () => {
        if (!current) return
        const value = answers[current.id]
        const err = validateAnswer(current, value)
        if (err) {
            setError(err)
            frameRef.current?.shake()
            frameRef.current?.focus()
            return
        }
        setError(null)
        if (isLast) {
            try {
                setSubmitting(true)
                await onSubmit()
            } finally {
                setSubmitting(false)
            }
        } else {
            setStep((s) => s + 1)
        }
    }, [current, answers, isLast, onSubmit])

    // Auto-advance: only when the user has interacted with this step in this session.
    const wasAutoAdvanced = useRef<Set<string>>(new Set())
    useEffect(() => {
        if (!current) return
        const behavior = getFieldBehavior(current)
        if (!behavior.autoAdvances) return
        if (wasAutoAdvanced.current.has(current.id)) return
        if (!interactedStepsRef.current.has(current.id)) return
        const value = answers[current.id]
        if (isAnswerEmpty(value)) return
        wasAutoAdvanced.current.add(current.id)
        const id = window.setTimeout(() => {
            void goForward()
        }, 220)
        return () => window.clearTimeout(id)
    }, [current, answers, goForward])

    // Global keyboard handler.
    useEffect(() => {
        if (!current || disabled) return
        const behavior = getFieldBehavior(current)

        const onKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null
            const isInInput =
                target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)

            if (e.key === "Escape") {
                e.preventDefault()
                goBack()
                return
            }

            if (e.key === "Enter" && !e.shiftKey && !isInInput) {
                if (behavior.enterAdvances) {
                    e.preventDefault()
                    void goForward()
                }
                return
            }

            // Letter keys → select option (single/multi). Skip when typing in a real input.
            if (behavior.acceptsLetterKeys && !isInInput && /^[a-zA-Z]$/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
                const idx = letterToIndex(e.key)
                if (idx === null) return
                if (current.type === "single_select") {
                    const option = current.options[idx]
                    if (option !== undefined) {
                        e.preventDefault()
                        setAnswer(current.id, option)
                    }
                } else if (current.type === "multi_select") {
                    const option = current.options[idx]
                    if (option !== undefined) {
                        e.preventDefault()
                        const selected = Array.isArray(answers[current.id]) ? (answers[current.id] as string[]) : []
                        const next = selected.includes(option)
                            ? selected.filter((o) => o !== option)
                            : [...selected, option]
                        setAnswer(current.id, next)
                    }
                }
                return
            }

            // Number keys 1–9 → rating shortcut. Skip when typing in a real input.
            if (behavior.acceptsNumberKeys && !isInInput && /^[1-9]$/.test(e.key)) {
                if (current.type === "rating") {
                    const n = Number(e.key)
                    if (n >= 1 && n <= current.max) {
                        e.preventDefault()
                        setAnswer(current.id, n)
                    }
                }
            }
        }

        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [current, disabled, answers, goBack, goForward, setAnswer])

    if (visibleFields.length === 0) {
        return (
            <div className="flex min-h-svh flex-col items-center justify-center px-6 py-16 text-center">
                <p className="font-serif text-2xl text-muted-foreground">This form has no questions yet.</p>
            </div>
        )
    }

    if (!current) {
        return (
            <div className="flex min-h-svh flex-col items-center justify-center px-6 py-16 text-center">
                <p className="font-serif text-2xl text-muted-foreground">No visible questions for the current answers.</p>
            </div>
        )
    }

    return (
        <>
            <div className="flex min-h-svh flex-col justify-center pb-24 pt-24 sm:pt-28">
                <div className="mx-auto w-full max-w-3xl">
                    <div
                        key={current.id}
                        className="animate-in fade-in slide-in-from-bottom-6 duration-500"
                    >
                        <QuestionFrame
                            ref={frameRef}
                            field={current}
                            value={answers[current.id]}
                            onChange={(v) => setAnswer(current.id, v)}
                            onAdvance={() => void goForward()}
                            presentation="spotlight"
                            disabled={disabled || submitting}
                            error={error}
                            index={clampedStep + 1}
                            total={visibleFields.length}
                            isLast={isLast}
                            submitLabel={isLast ? submitButtonText : undefined}
                        />
                        {bottomSlot ? (
                            <div className="mt-10">{bottomSlot({ field: current, isLast })}</div>
                        ) : null}
                    </div>
                </div>
            </div>

            <ProgressRail
                index={clampedStep + 1}
                total={visibleFields.length}
                canBack={clampedStep > 0}
                canForward={!isAnswerEmpty(answers[current.id])}
                onBack={goBack}
                onForward={() => void goForward()}
                disabled={disabled || submitting}
            />
        </>
    )
}
