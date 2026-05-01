"use client"

import { CheckCircle2, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Props {
    message?: string | null
    onSubmitAnother?: () => void
}

export function ThankYouScreen({ message, onSubmitAnother }: Props) {
    return (
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center sm:py-20">
            <div className="w-full max-w-xl animate-in fade-in slide-in-from-bottom-4 duration-700">
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/5 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-emerald-600 animate-in zoom-in-50 duration-500 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Response received
                </span>
                <h2 className="mt-8 font-serif font-medium leading-[1.05] tracking-tight text-4xl sm:text-6xl">
                    Thank you
                </h2>
                <p className="mx-auto mt-6 max-w-md whitespace-pre-wrap text-base text-muted-foreground sm:text-lg">
                    {message ?? "Your response has been submitted securely."}
                </p>
                {onSubmitAnother ? (
                    <div className="mt-10 flex items-center justify-center gap-4">
                        <span className="hidden h-px w-10 bg-border/60 sm:inline-block" aria-hidden />
                        <Button
                            type="button"
                            variant="outline"
                            size="lg"
                            onClick={onSubmitAnother}
                            className="group h-11 rounded-full border-border/60 bg-background/60 px-5 text-sm font-medium backdrop-blur-sm transition-all hover:border-foreground/30 hover:bg-background"
                        >
                            <RotateCcw className="mr-2 h-3.5 w-3.5 transition-transform group-hover:-rotate-45" />
                            Submit another response
                        </Button>
                        <span className="hidden h-px w-10 bg-border/60 sm:inline-block" aria-hidden />
                    </div>
                ) : null}
            </div>
        </div>
    )
}
