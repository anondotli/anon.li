import { cn } from "@/lib/utils"

type FormStatusKind = "live" | "paused" | "closed" | "limit" | "taken-down"

export interface FormDisplayStatus {
    kind: FormStatusKind
    label: string
    dotClassName: string
    badgeClassName: string
}

/** Minimal shape needed to derive a form's display status — both the list item
 *  and the responses-page form meta satisfy it structurally. */
export interface FormStatusInput {
    active: boolean
    disabledByUser: boolean
    takenDown: boolean
    closesAt: string | null
    maxSubmissions: number | null
    submissionsCount: number
}

export function getFormStatus(form: FormStatusInput, now: number = Date.now()): FormDisplayStatus {
    const isClosed = form.closesAt ? new Date(form.closesAt).getTime() < now : false
    const isAtLimit = form.maxSubmissions != null && form.submissionsCount >= form.maxSubmissions

    if (form.takenDown) {
        return {
            kind: "taken-down",
            label: "Taken down",
            dotClassName: "bg-destructive",
            badgeClassName: "border-destructive/25 bg-destructive/5 text-destructive",
        }
    }

    if (form.disabledByUser || !form.active) {
        return {
            kind: "paused",
            label: "Paused",
            dotClassName: "bg-muted-foreground",
            badgeClassName: "border-border/60 bg-secondary/50 text-muted-foreground",
        }
    }

    if (isClosed) {
        return {
            kind: "closed",
            label: "Closed",
            dotClassName: "bg-amber-500",
            badgeClassName: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        }
    }

    if (isAtLimit) {
        return {
            kind: "limit",
            label: "Limit reached",
            dotClassName: "bg-amber-500",
            badgeClassName: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        }
    }

    return {
        kind: "live",
        label: "Live",
        dotClassName: "bg-emerald-500",
        badgeClassName: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    }
}

export function StatusBadge({ status, className }: { status: FormDisplayStatus; className?: string }) {
    return (
        <span
            className={cn(
                "inline-flex h-[22px] items-center gap-1.5 rounded-full border px-2 text-[10px] font-medium tracking-[0.04em]",
                status.badgeClassName,
                className,
            )}
        >
            <span className={cn("h-1.5 w-1.5 rounded-full", status.dotClassName)} />
            {status.label}
        </span>
    )
}

/** Inline dot + label for headers (no badge chrome). */
export function StatusDot({
    status,
    className,
}: {
    status: FormDisplayStatus
    className?: string
}) {
    return (
        <span className={cn("inline-flex items-center gap-1.5", className)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", status.dotClassName)} />
            {status.label}
        </span>
    )
}
