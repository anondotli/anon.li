"use client"

import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const RANGES = [
    { value: 7, label: "7d" },
    { value: 30, label: "30d" },
    { value: 90, label: "90d" },
]

/** URL-driven analytics range toggle (?range=7|30|90). */
export function RangeTabs({ current }: { current: number }) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const select = (value: number) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set("range", String(value))
        router.push(`${pathname}?${params.toString()}`)
    }

    return (
        <div className="inline-flex items-center gap-1 rounded-lg border bg-muted/40 p-0.5">
            {RANGES.map((r) => (
                <button
                    key={r.value}
                    onClick={() => select(r.value)}
                    className={cn(
                        "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                        current === r.value
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    {r.label}
                </button>
            ))}
        </div>
    )
}
