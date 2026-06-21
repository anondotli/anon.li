import { Star } from "lucide-react"
import { cn } from "@/lib/utils"
import type { AddressValue } from "@/lib/form-schema"
import type { FormFieldMeta } from "./shared"
import { formatAnswerText, isEmptyAnswer } from "./shared"

function ScaleBadge({ value, max, size = "sm" }: { value: number; max?: number; size?: "sm" | "md" }) {
    return (
        <span className={cn("font-mono tabular-nums", size === "md" ? "text-base" : "text-xs")}>
            {value}
            {max !== undefined ? <span className="text-muted-foreground/60"> / {max}</span> : null}
        </span>
    )
}

function addressLines(value: AddressValue): string[] {
    const cityLine = [value.city, value.state, value.postalCode].filter((p) => p && p.trim()).join(", ")
    return [value.line1, value.line2, cityLine, value.country].filter((l): l is string => Boolean(l && l.trim()))
}

function toArray(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(String)
    if (isEmptyAnswer(value)) return []
    return [String(value)]
}

export function RatingStars({ value, max, size = "sm" }: { value: number; max: number; size?: "sm" | "md" }) {
    const dim = size === "md" ? "h-4 w-4" : "h-3.5 w-3.5"
    return (
        <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-center gap-0.5">
                {Array.from({ length: max }, (_, i) => (
                    <Star
                        key={i}
                        className={cn(
                            dim,
                            i < value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30",
                        )}
                    />
                ))}
            </span>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {value}/{max}
            </span>
        </span>
    )
}

function Chip({ children }: { children: React.ReactNode }) {
    return (
        <span className="inline-flex items-center rounded-md border border-border/60 bg-secondary/40 px-2 py-0.5 text-xs font-medium">
            {children}
        </span>
    )
}

const EMPTY = <span className="text-muted-foreground/50">—</span>

/**
 * Compact, single-line answer rendering for the responses table. Chips and
 * stars stay readable while long text is truncated by the cell.
 */
export function AnswerCell({ field, value }: { field: FormFieldMeta; value: unknown }) {
    if (isEmptyAnswer(value)) return EMPTY

    if (field.type === "rating" && typeof value === "number") {
        return <RatingStars value={value} max={field.max ?? 5} />
    }
    if (field.type === "linear_scale" && typeof value === "number") {
        return <ScaleBadge value={value} max={field.max} />
    }
    if (field.type === "ranking" && Array.isArray(value)) {
        return (
            <span className="block truncate text-sm">
                {value.map((item, i) => `${i + 1}. ${item}`).join(" · ")}
            </span>
        )
    }
    if (field.type === "multi_select") {
        const items = toArray(value)
        return (
            <span className="flex flex-wrap items-center gap-1">
                {items.slice(0, 3).map((item, i) => (
                    <Chip key={`${item}-${i}`}>{item}</Chip>
                ))}
                {items.length > 3 ? (
                    <span className="text-xs text-muted-foreground">+{items.length - 3}</span>
                ) : null}
            </span>
        )
    }
    if (field.type === "single_select" || field.type === "dropdown") {
        return <Chip>{formatAnswerText(value)}</Chip>
    }
    return <span className="block truncate">{formatAnswerText(value)}</span>
}

/**
 * Full answer rendering for the detail panel — wraps text and shows every chip.
 */
export function AnswerBlock({ field, value }: { field: FormFieldMeta; value: unknown }) {
    if (isEmptyAnswer(value)) {
        return <span className="text-sm italic text-muted-foreground">No answer</span>
    }

    if (field.type === "rating" && typeof value === "number") {
        return <RatingStars value={value} max={field.max ?? 5} size="md" />
    }
    if (field.type === "linear_scale" && typeof value === "number") {
        return <ScaleBadge value={value} max={field.max} size="md" />
    }
    if (field.type === "ranking" && Array.isArray(value)) {
        return (
            <ol className="space-y-1">
                {value.map((item, i) => (
                    <li key={`${item}-${i}`} className="flex items-baseline gap-2 text-sm">
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">{i + 1}.</span>
                        <span className="break-words">{String(item)}</span>
                    </li>
                ))}
            </ol>
        )
    }
    if (field.type === "address") {
        const lines = addressLines(value as AddressValue)
        return (
            <span className="block space-y-0.5 font-serif text-base leading-relaxed">
                {lines.map((line, i) => (
                    <span key={i} className="block break-words">
                        {line}
                    </span>
                ))}
            </span>
        )
    }
    if (field.type === "multi_select") {
        return (
            <span className="flex flex-wrap gap-1.5">
                {toArray(value).map((item, i) => (
                    <Chip key={`${item}-${i}`}>{item}</Chip>
                ))}
            </span>
        )
    }
    if (field.type === "single_select" || field.type === "dropdown") {
        return <Chip>{formatAnswerText(value)}</Chip>
    }
    if (field.type === "email") {
        return (
            <a href={`mailto:${formatAnswerText(value)}`} className="break-words font-serif text-base leading-relaxed text-foreground underline-offset-4 hover:underline">
                {formatAnswerText(value)}
            </a>
        )
    }
    return (
        <span className="whitespace-pre-wrap break-words font-serif text-base leading-relaxed">
            {formatAnswerText(value)}
        </span>
    )
}
