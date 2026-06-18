import Link from "next/link"
import { cn } from "@/lib/utils"
import { Progress } from "@/components/ui/progress"

interface UsageMeterProps {
    label: string
    used: number
    /** -1 means unlimited. */
    limit: number
    caption?: string
    /** When set and usage is high, shows an "Upgrade →" link to this href. */
    upgradeHref?: string
    className?: string
}

export function UsageMeter({ label, used, limit, caption, upgradeHref, className }: UsageMeterProps) {
    const unlimited = limit === -1
    const percent = unlimited ? 0 : Math.min((used / limit) * 100, 100)
    const indicatorClassName = unlimited
        ? "bg-primary"
        : percent >= 80
            ? "bg-destructive"
            : percent >= 60
                ? "bg-amber-500"
                : "bg-primary"
    const showUpgrade = Boolean(upgradeHref) && !unlimited && percent >= 80

    return (
        <div
            className={cn(
                "space-y-3 rounded-xl border border-border/60 bg-card p-4 luxury-shadow-sm",
                className,
            )}
        >
            <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{label}</span>
                <span className="font-mono text-sm tabular-nums text-muted-foreground">
                    {used.toLocaleString()} / {unlimited ? "∞" : limit.toLocaleString()}
                </span>
            </div>
            <Progress value={percent} indicatorClassName={indicatorClassName} />
            {caption || showUpgrade ? (
                <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">{caption ?? ""}</span>
                    {showUpgrade && upgradeHref ? (
                        <Link
                            href={upgradeHref}
                            className="shrink-0 text-xs font-medium text-primary hover:underline"
                        >
                            Upgrade →
                        </Link>
                    ) : null}
                </div>
            ) : null}
        </div>
    )
}
