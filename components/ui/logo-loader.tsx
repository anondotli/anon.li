"use client"
import { cn } from "@/lib/utils"
import { Icons } from "@/components/shared/icons"

const outerSize = { sm: "h-14 w-14", md: "h-20 w-20", lg: "h-32 w-32" }
const iconSize  = { sm: "h-5 w-5",  md: "h-7 w-7",  lg: "h-10 w-10" }

export function LogoLoader({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
    return (
        <div className={cn("relative flex items-center justify-center", outerSize[size], className)}>
            {/* Single thin ring — slow pulse */}
            <div className="absolute inset-0 rounded-full border border-foreground/[0.06] animate-loader-ring" />

            {/* Logo — slow elegant fade */}
            <Icons.logo className={cn("relative text-foreground animate-logo-breathe", iconSize[size])} />
        </div>
    )
}