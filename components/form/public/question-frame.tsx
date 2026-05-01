"use client"

import { forwardRef, useImperativeHandle, useRef } from "react"
import { ArrowRight, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { FieldInput, type FieldHandle, getFieldBehavior } from "./fields"
import { PressEnterHint, KeyboardHint, Kbd } from "./keyboard-hint"
import type { FormField } from "@/lib/form-schema"

export interface QuestionFrameHandle {
    focus: () => void
    shake: () => void
}

interface Props {
    field: FormField
    value: unknown
    onChange: (next: unknown) => void
    onAdvance: () => void
    presentation?: "spotlight" | "compact"
    disabled?: boolean
    error?: string | null
    /** 1-based position of this question among all visible. */
    index: number
    /** Total number of visible questions. */
    total: number
    /** Override label of the OK / submit button. */
    submitLabel?: string
    /** When true, this is the final question and the button should say submit. */
    isLast?: boolean
    /** When false, hides the question number prefix. Useful for the welcome card. */
    showIndex?: boolean
    /** Replaces the inline label/help with custom JSX (used by the builder for inline editing). */
    overrideLabel?: React.ReactNode
    overrideHelp?: React.ReactNode
}

export const QuestionFrame = forwardRef<QuestionFrameHandle, Props>(function QuestionFrame(
    {
        field,
        value,
        onChange,
        onAdvance,
        presentation = "spotlight",
        disabled,
        error,
        index,
        total,
        submitLabel,
        isLast,
        showIndex = true,
        overrideLabel,
        overrideHelp,
    },
    ref,
) {
    const fieldRef = useRef<FieldHandle>(null)
    const wrapperRef = useRef<HTMLDivElement>(null)

    useImperativeHandle(
        ref,
        () => ({
            focus: () => fieldRef.current?.focus(),
            shake: () => {
                const el = wrapperRef.current
                if (!el) return
                el.classList.remove("animate-shake")
                // Force reflow so the animation re-triggers when called twice in a row.
                void el.offsetWidth
                el.classList.add("animate-shake")
            },
        }),
        [],
    )

    const behavior = getFieldBehavior(field)
    const showOk = !behavior.autoAdvances
    const padded = String(index).padStart(String(total).length, "0")
    const spotlight = presentation === "spotlight"

    return (
        <div ref={wrapperRef} className={cn(spotlight && "w-full max-w-2xl")}>
            {showIndex && spotlight ? (
                <div className="mb-4 flex items-center gap-2 font-mono text-xs text-muted-foreground">
                    <span>{padded}</span>
                    <ArrowRight className="h-3 w-3" />
                </div>
            ) : null}

            {overrideLabel ?? (
                <label
                    htmlFor={field.id}
                    className={cn(
                        spotlight
                            ? "block font-serif font-medium leading-[1.1] tracking-tight text-3xl sm:text-4xl md:text-5xl"
                            : "block text-base font-medium",
                    )}
                >
                    {field.label}
                    {field.required ? <span className="ml-1.5 text-destructive">*</span> : null}
                </label>
            )}

            {overrideHelp ??
                (field.helpText ? (
                    <p
                        className={cn(
                            "text-muted-foreground",
                            spotlight ? "mt-3 max-w-xl text-base leading-relaxed" : "mt-1 text-xs",
                        )}
                    >
                        {field.helpText}
                    </p>
                ) : null)}

            <div className={cn(spotlight ? "mt-8" : "mt-2")}>
                <FieldInput
                    ref={fieldRef}
                    field={field}
                    value={value}
                    onChange={onChange}
                    onAdvance={onAdvance}
                    presentation={presentation}
                    disabled={disabled}
                    autoFocus={spotlight}
                />
            </div>

            {error ? (
                <div className="mt-4 flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                </div>
            ) : null}

            {spotlight && showOk ? (
                <div className="mt-8 flex flex-wrap items-center gap-4">
                    <Button
                        type="button"
                        size="lg"
                        onClick={onAdvance}
                        disabled={disabled}
                        className="h-12 min-w-[7rem] px-6 text-base"
                    >
                        {submitLabel ?? (isLast ? "Submit" : "OK")}
                        <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                    {field.type === "long_text" ? (
                        <KeyboardHint>
                            <Kbd>Shift</Kbd> + <Kbd>↵</Kbd> for new line · <Kbd>⌘</Kbd> + <Kbd>↵</Kbd> to continue
                        </KeyboardHint>
                    ) : (
                        <PressEnterHint label="to continue" />
                    )}
                </div>
            ) : null}
        </div>
    )
})
