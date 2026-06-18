import { Card, CardContent } from "@/components/ui/card"
import { LucideIcon, ArrowUpRight, ArrowDownRight } from "lucide-react"
import Link from "next/link"
import { ReactNode } from "react"
import { cn } from "@/lib/utils"

type StatVariant = "default" | "destructive" | "success" | "warning"

interface StatCardProps {
    title: string
    value: string | number
    description?: string
    icon: LucideIcon
    href?: string
    variant?: StatVariant
    /** Percentage change vs. the previous period. Positive renders green, negative red. */
    delta?: number | null
    /** Inline sparkline / mini-chart rendered beneath the value. */
    sparkline?: ReactNode
}

const accentBar: Record<StatVariant, string> = {
    default: "bg-foreground/20",
    destructive: "bg-destructive",
    success: "bg-[hsl(var(--success))]",
    warning: "bg-[hsl(var(--warning))]",
}

const valueColor: Record<StatVariant, string> = {
    default: "",
    destructive: "text-destructive",
    success: "",
    warning: "",
}

export function StatCard({
    title,
    value,
    description,
    icon: Icon,
    href,
    variant = "default",
    delta,
    sparkline,
}: StatCardProps) {
    const content = (
        <Card
            className={cn(
                "relative overflow-hidden",
                href && "transition-colors hover:bg-muted/50 cursor-pointer",
                variant === "destructive" && "border-destructive/40 bg-destructive/5 hover:bg-destructive/10"
            )}
        >
            <span className={cn("absolute inset-y-0 left-0 w-0.5", accentBar[variant])} aria-hidden />
            <CardContent className="p-5">
                <div className="flex items-center justify-between gap-2">
                    <p
                        className={cn(
                            "text-sm font-medium",
                            variant === "destructive" ? "text-destructive" : "text-muted-foreground"
                        )}
                    >
                        {title}
                    </p>
                    <Icon
                        className={cn(
                            "h-4 w-4 shrink-0",
                            variant === "destructive" ? "text-destructive" : "text-muted-foreground"
                        )}
                    />
                </div>

                <div className="mt-2 flex items-end justify-between gap-2">
                    <div className={cn("text-2xl font-bold tabular-nums", valueColor[variant])}>{value}</div>
                    {typeof delta === "number" && (
                        <span
                            className={cn(
                                "flex items-center gap-0.5 text-xs font-medium",
                                delta >= 0 ? "text-[hsl(var(--success))]" : "text-destructive"
                            )}
                        >
                            {delta >= 0 ? (
                                <ArrowUpRight className="h-3 w-3" />
                            ) : (
                                <ArrowDownRight className="h-3 w-3" />
                            )}
                            {Math.abs(delta)}%
                        </span>
                    )}
                </div>

                {sparkline && <div className="mt-3 h-10">{sparkline}</div>}

                {description && (
                    <p
                        className={cn(
                            "mt-1 text-xs",
                            variant === "destructive" ? "text-destructive/80" : "text-muted-foreground"
                        )}
                    >
                        {description}
                    </p>
                )}
            </CardContent>
        </Card>
    )

    if (href) {
        return <Link href={href}>{content}</Link>
    }

    return content
}
