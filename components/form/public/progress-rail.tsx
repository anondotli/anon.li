"use client"

import { ChevronUp, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface Props {
    /** 1-based current question. */
    index: number
    total: number
    canBack: boolean
    canForward: boolean
    onBack: () => void
    onForward: () => void
    disabled?: boolean
}

export function ProgressRail({ index, total, canBack, canForward, onBack, onForward, disabled }: Props) {
    const pct = total > 0 ? Math.min(100, Math.round((index / total) * 100)) : 0
    const padded = String(index).padStart(String(total).length, "0")
    const totalPadded = String(total)

    return (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20">
            <div className="pointer-events-auto flex items-center justify-between gap-3 border-t border-border/40 bg-background/80 px-4 py-3 backdrop-blur-md sm:px-8">
                <span className="font-mono text-xs text-muted-foreground">
                    {padded} <span className="opacity-60">/ {totalPadded}</span>
                </span>
                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={onBack}
                        disabled={!canBack || disabled}
                        aria-label="Previous question"
                        className="h-9 w-9"
                    >
                        <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={onForward}
                        disabled={!canForward || disabled}
                        aria-label="Next question"
                        className="h-9 w-9"
                    >
                        <ChevronDown className="h-4 w-4" />
                    </Button>
                </div>
            </div>
            <div className="h-[3px] w-full bg-secondary/40">
                <div
                    className={cn("h-full bg-foreground transition-[width] duration-500 ease-out")}
                    style={{ width: `${pct}%` }}
                    aria-hidden
                />
            </div>
        </div>
    )
}
