import { cn } from "@/lib/utils"
import { LazyDotGrid } from "./lazy-dot-grid"

// Ambient blur "blobs" behind a hero. Each variant places them differently so
// pages don't end up with pixel-identical backgrounds.
const VARIANTS = {
    center: [
        "top-0 left-1/2 -translate-x-1/2 h-[400px] w-[600px] bg-primary/10 opacity-50 blur-[80px]",
        "bottom-0 right-0 h-[300px] w-[400px] bg-secondary/10 opacity-30 blur-[60px]",
    ],
    right: [
        "-top-16 -right-16 h-[420px] w-[520px] bg-primary/10 opacity-50 blur-[90px]",
        "-bottom-8 left-[10%] h-[300px] w-[360px] bg-secondary/10 opacity-25 blur-[70px]",
    ],
    left: [
        "-top-12 -left-12 h-[400px] w-[520px] bg-primary/10 opacity-50 blur-[90px]",
        "bottom-0 right-[8%] h-[300px] w-[380px] bg-secondary/10 opacity-25 blur-[70px]",
    ],
    minimal: ["-top-24 left-1/2 -translate-x-1/2 h-[360px] w-[680px] bg-primary/10 opacity-40 blur-[100px]"],
} as const

interface GlowBackgroundProps {
    variant?: keyof typeof VARIANTS
    /** Render the interactive dot grid (skip it on dense/functional pages). */
    dots?: boolean
}

export function GlowBackground({ variant = "center", dots = true }: GlowBackgroundProps) {
    return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {dots && <LazyDotGrid />}
            {VARIANTS[variant].map((blob, i) => (
                <div key={i} className={cn("pointer-events-none absolute rounded-full", blob)} />
            ))}
        </div>
    )
}
