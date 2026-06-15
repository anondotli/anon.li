"use client"

import * as React from "react"
import { ShieldCheck } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type VaultAuthTone = "neutral" | "success" | "error" | "warning"

const EMBLEM_TONE: Record<VaultAuthTone, string> = {
    neutral: "border border-border/70 bg-background text-foreground",
    success: "bg-success/10 text-success",
    error: "bg-destructive/10 text-destructive",
    warning: "bg-warning/10 text-warning",
}

interface VaultAuthShellProps {
    /** Icon rendered inside the emblem (size it h-6 w-6). */
    icon: React.ReactNode
    tone?: VaultAuthTone
    /** Adds a subtle pulse to the emblem (e.g. while a request is in flight). */
    pulse?: boolean
    title: string
    description: React.ReactNode
    /** The form / primary body. */
    children: React.ReactNode
    /** Optional links rendered below the body, inside the card content. */
    below?: React.ReactNode
    /** Footer strip. Defaults to the zero-knowledge badge; pass `null` to hide. */
    footer?: React.ReactNode
}

const DEFAULT_FOOTER = (
    <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" />
        End-to-end encrypted · Zero-knowledge
    </p>
)

/**
 * Shared presentation shell for vault password screens (unlock, setup, reset).
 * Provides the ambient backdrop, glass card, state-aware emblem, and footer
 * so every vault auth surface stays visually identical.
 */
export function VaultAuthShell({
    icon,
    tone = "neutral",
    pulse = false,
    title,
    description,
    children,
    below,
    footer = DEFAULT_FOOTER,
}: VaultAuthShellProps) {
    return (
        <div className="relative flex min-h-[70vh] items-center justify-center overflow-hidden px-3 py-12 sm:px-4">
            {/* Ambient backdrop */}
            <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
                <div className="absolute left-1/2 top-1/2 h-[32rem] w-[32rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/[0.04] blur-3xl dark:bg-foreground/[0.06]" />
                <div className="absolute inset-0 bg-grid-white opacity-40 dark:opacity-100 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
            </div>

            <Card className="w-full max-w-md overflow-hidden rounded-[1.75rem] border-border/60 bg-card/80 luxury-shadow-lg backdrop-blur-xl duration-500 animate-in fade-in zoom-in-95">
                <CardContent className="flex flex-col items-center px-5 pb-8 pt-9 sm:px-9">
                    {/* Emblem */}
                    <div className="relative mb-7 flex items-center justify-center">
                        <div
                            data-tone={tone}
                            className={cn(
                                "relative flex h-14 w-14 items-center justify-center rounded-2xl shadow-inner transition-all duration-500",
                                pulse && "animate-pulse",
                                EMBLEM_TONE[tone],
                            )}
                        >
                            {icon}
                        </div>
                    </div>

                    <h1 className="text-center font-serif text-[1.7rem] leading-tight tracking-tight">
                        {title}
                    </h1>
                    <div className="mx-auto mt-2 max-w-xs text-center text-sm leading-relaxed text-muted-foreground">
                        {description}
                    </div>

                    {children}

                    {below}
                </CardContent>

                {footer !== null && (
                    <div className="border-t border-border/50 bg-muted/20 px-5 py-3.5 sm:px-9">
                        {footer}
                    </div>
                )}
            </Card>
        </div>
    )
}
