import { AlertCircle, Info, Lock, Clock } from "lucide-react"
import { cn } from "@/lib/utils"

type Tone = "info" | "warn" | "error" | "lock" | "closed"

const tones: Record<Tone, { icon: React.ComponentType<{ className?: string }>; classes: string }> = {
    info: {
        icon: Info,
        classes: "border-border/60 bg-secondary/40 text-muted-foreground",
    },
    warn: {
        icon: AlertCircle,
        classes: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    },
    error: {
        icon: AlertCircle,
        classes: "border-destructive/30 bg-destructive/10 text-destructive",
    },
    lock: {
        icon: Lock,
        classes: "border-border/60 bg-secondary/40 text-foreground",
    },
    closed: {
        icon: Clock,
        classes: "border-border/60 bg-secondary/40 text-foreground",
    },
}

interface Props {
    tone?: Tone
    title?: string
    children: React.ReactNode
    className?: string
}

export function Notice({ tone = "info", title, children, className }: Props) {
    const { icon: Icon, classes } = tones[tone]
    return (
        <div className={cn("flex gap-3 rounded-xl border p-4 text-sm", classes, className)}>
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1">
                {title ? <p className="font-medium">{title}</p> : null}
                <div className="leading-relaxed">{children}</div>
            </div>
        </div>
    )
}
