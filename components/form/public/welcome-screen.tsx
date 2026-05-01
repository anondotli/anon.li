"use client"

import { useEffect, useRef } from "react"
import { ArrowRight, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PressEnterHint } from "./keyboard-hint"

interface Props {
    title: string
    description?: string | null
    questionCount: number
    onStart: () => void
    disabled?: boolean
    startLabel?: string
    /** When false, renders the welcome layout but skips the Start button (useful for closed/locked states). */
    showStart?: boolean
    children?: React.ReactNode
}

export function WelcomeScreen({
    title,
    description,
    questionCount,
    onStart,
    disabled,
    startLabel = "Start",
    showStart = true,
    children,
}: Props) {
    const buttonRef = useRef<HTMLButtonElement>(null)

    useEffect(() => {
        if (!showStart || disabled) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Enter") {
                e.preventDefault()
                onStart()
            }
        }
        window.addEventListener("keydown", onKey)
        buttonRef.current?.focus()
        return () => window.removeEventListener("keydown", onKey)
    }, [onStart, disabled, showStart])

    const minutes = Math.max(1, Math.ceil(questionCount * 0.4))

    return (
        <div className="flex min-h-svh flex-col items-center justify-center py-16">
            <div className="w-full max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-700">
                <h1 className="font-serif font-medium leading-[1.05] tracking-tight text-4xl sm:text-6xl">
                    {title}
                </h1>
                {description ? (
                    <p className="mt-6 max-w-xl whitespace-pre-wrap text-base text-muted-foreground sm:text-lg">
                        {description}
                    </p>
                ) : null}

                {children}

                {showStart ? (
                    <div className="mt-12 flex flex-wrap items-center gap-5">
                        <Button
                            ref={buttonRef}
                            type="button"
                            size="lg"
                            onClick={onStart}
                            disabled={disabled}
                            className="h-12 min-w-[8rem] px-6 text-base"
                        >
                            {startLabel}
                            <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                        <PressEnterHint label="to begin" />
                    </div>
                ) : null}

                {showStart && questionCount > 0 ? (
                    <p className="mt-6 inline-flex items-center gap-2 font-mono text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        ≈ {minutes} min · {questionCount} {questionCount === 1 ? "question" : "questions"}
                    </p>
                ) : null}
            </div>
        </div>
    )
}
