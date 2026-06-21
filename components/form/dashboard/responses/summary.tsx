import { useMemo } from "react"
import { BarChart3 } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"
import { Stat } from "@/components/ui/stat"
import { RatingStars } from "./answer-display"
import type { FormFieldMeta } from "./shared"
import { formatAnswerText, isChoiceField, isEmptyAnswer } from "./shared"

interface ReadyRow {
    id: string
    answers: Record<string, unknown>
    hasFiles: boolean
    fileCountByField: Record<string, number>
}

export function ResponsesSummary({ fields, rows }: { fields: FormFieldMeta[]; rows: ReadyRow[] }) {
    const total = rows.length

    if (total === 0) {
        return (
            <EmptyState
                variant="panel"
                icon={BarChart3}
                title="Nothing to summarize yet"
                description="Per-question insights appear here once responses are decrypted."
                className="py-12"
            />
        )
    }

    return (
        <div className="grid gap-4 lg:grid-cols-2">
            {fields.map((field) => (
                <FieldSummary key={field.id} field={field} rows={rows} total={total} />
            ))}
        </div>
    )
}

function FieldSummary({ field, rows, total }: { field: FormFieldMeta; rows: ReadyRow[]; total: number }) {
    const answered = useMemo(
        () =>
            field.type === "file"
                ? rows.filter((r) => (r.fileCountByField[field.id] ?? 0) > 0).length
                : rows.filter((r) => !isEmptyAnswer(r.answers[field.id])).length,
        [field, rows],
    )

    return (
        <section className="flex flex-col rounded-xl border border-border/60 bg-card p-5 luxury-shadow-sm">
            <header className="mb-4 flex items-start justify-between gap-3">
                <h3 className="font-medium leading-snug">{field.label}</h3>
                <span className="shrink-0 whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">
                    {answered} of {total}
                </span>
            </header>
            <SummaryBody field={field} rows={rows} answered={answered} />
        </section>
    )
}

function SummaryBody({ field, rows, answered }: { field: FormFieldMeta; rows: ReadyRow[]; answered: number }) {
    if (answered === 0) {
        return <p className="text-sm italic text-muted-foreground">No answers yet</p>
    }

    if (isChoiceField(field.type) && field.options) {
        return <ChoiceDistribution field={field} rows={rows} />
    }
    if (field.type === "rating") {
        return <RatingSummary field={field} rows={rows} />
    }
    if (field.type === "linear_scale") {
        return <LinearScaleSummary field={field} rows={rows} />
    }
    if (field.type === "ranking" && field.options) {
        return <RankingSummary field={field} rows={rows} />
    }
    if (field.type === "number") {
        return <NumberSummary field={field} rows={rows} />
    }
    if (field.type === "file") {
        return <FileSummary field={field} rows={rows} />
    }
    return <TextSamples field={field} rows={rows} />
}

function Bar({ label, count, total, hint }: { label: string; count: number; total: number; hint?: string }) {
    const pct = total === 0 ? 0 : Math.round((count / total) * 100)
    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate" title={label}>
                    {label}
                </span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {hint ?? `${count} · ${pct}%`}
                </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-primary/70 transition-all" style={{ width: `${pct}%` }} />
            </div>
        </div>
    )
}

function ChoiceDistribution({ field, rows }: { field: FormFieldMeta; rows: ReadyRow[] }) {
    const counts = useMemo(() => {
        const map = new Map<string, number>((field.options ?? []).map((o) => [o, 0]))
        for (const row of rows) {
            const value = row.answers[field.id]
            const selected = Array.isArray(value) ? value.map(String) : isEmptyAnswer(value) ? [] : [String(value)]
            for (const sel of selected) map.set(sel, (map.get(sel) ?? 0) + 1)
        }
        return map
    }, [field, rows])

    // For multi-select, percentages are relative to respondents (who can pick many).
    const denom = useMemo(
        () =>
            field.type === "multi_select"
                ? rows.filter((r) => !isEmptyAnswer(r.answers[field.id])).length
                : rows.length,
        [field, rows],
    )

    return (
        <div className="space-y-3">
            {[...counts.entries()].map(([option, count]) => (
                <Bar key={option} label={option} count={count} total={denom} />
            ))}
        </div>
    )
}

function RatingSummary({ field, rows }: { field: FormFieldMeta; rows: ReadyRow[] }) {
    const { values, average, max } = useMemo(() => {
        const max = field.max ?? 5
        const values = rows
            .map((r) => r.answers[field.id])
            .filter((v): v is number => typeof v === "number")
        const average = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
        return { values, average, max }
    }, [field, rows])

    const histogram = useMemo(() => {
        const buckets = Array.from({ length: max }, (_, i) => ({ score: i + 1, count: 0 }))
        for (const v of values) {
            const b = buckets[v - 1]
            if (b) b.count += 1
        }
        return buckets
    }, [values, max])

    return (
        <div className="space-y-4">
            <div className="flex items-baseline gap-3">
                <span className="font-mono text-3xl font-medium tabular-nums">{average.toFixed(1)}</span>
                <RatingStars value={Math.round(average)} max={max} size="md" />
            </div>
            <div className="space-y-2">
                {histogram
                    .slice()
                    .reverse()
                    .map((bucket) => (
                        <Bar
                            key={bucket.score}
                            label={`${bucket.score} ★`}
                            count={bucket.count}
                            total={values.length}
                        />
                    ))}
            </div>
        </div>
    )
}

function LinearScaleSummary({ field, rows }: { field: FormFieldMeta; rows: ReadyRow[] }) {
    const { values, average, min, max } = useMemo(() => {
        const min = field.min ?? 1
        const max = field.max ?? 5
        const values = rows
            .map((r) => r.answers[field.id])
            .filter((v): v is number => typeof v === "number")
        const average = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
        return { values, average, min, max }
    }, [field, rows])

    const histogram = useMemo(() => {
        const buckets = Array.from({ length: max - min + 1 }, (_, i) => ({ score: min + i, count: 0 }))
        for (const v of values) {
            const b = buckets[v - min]
            if (b) b.count += 1
        }
        return buckets
    }, [values, min, max])

    return (
        <div className="space-y-4">
            <div className="flex items-baseline gap-2">
                <span className="font-mono text-3xl font-medium tabular-nums">{average.toFixed(1)}</span>
                <span className="text-sm text-muted-foreground">avg · {min}–{max}</span>
            </div>
            <div className="space-y-2">
                {histogram.map((bucket) => (
                    <Bar key={bucket.score} label={String(bucket.score)} count={bucket.count} total={values.length} />
                ))}
            </div>
        </div>
    )
}

function RankingSummary({ field, rows }: { field: FormFieldMeta; rows: ReadyRow[] }) {
    const ranked = useMemo(() => {
        const options = field.options ?? []
        const sums = new Map<string, { total: number; count: number }>(options.map((o) => [o, { total: 0, count: 0 }]))
        for (const row of rows) {
            const value = row.answers[field.id]
            if (!Array.isArray(value)) continue
            value.forEach((opt, index) => {
                const entry = sums.get(String(opt))
                if (entry) {
                    entry.total += index + 1
                    entry.count += 1
                }
            })
        }
        return options
            .map((option) => {
                const entry = sums.get(option)!
                const avg = entry.count > 0 ? entry.total / entry.count : 0
                return { option, avg, count: entry.count }
            })
            .filter((r) => r.count > 0)
            .sort((a, b) => a.avg - b.avg)
    }, [field, rows])

    const n = field.options?.length ?? 1

    return (
        <div className="space-y-3">
            {ranked.map(({ option, avg }) => {
                // Best possible avg rank is 1 → full bar; worst is n → empty.
                const pct = n > 1 ? Math.round((1 - (avg - 1) / (n - 1)) * 100) : 100
                return (
                    <div key={option} className="space-y-1">
                        <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="min-w-0 flex-1 truncate" title={option}>
                                {option}
                            </span>
                            <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                                avg {avg.toFixed(2)}
                            </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-secondary">
                            <div className="h-full rounded-full bg-primary/70 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

function NumberSummary({ field, rows }: { field: FormFieldMeta; rows: ReadyRow[] }) {
    const stats = useMemo(() => {
        const values = rows
            .map((r) => r.answers[field.id])
            .map((v) => (typeof v === "number" ? v : Number(v)))
            .filter((v) => Number.isFinite(v))
        if (values.length === 0) return null
        const sum = values.reduce((a, b) => a + b, 0)
        return {
            count: values.length,
            average: sum / values.length,
            min: Math.min(...values),
            max: Math.max(...values),
        }
    }, [field, rows])

    if (!stats) return <p className="text-sm italic text-muted-foreground">No numeric answers</p>

    return (
        <div className="grid grid-cols-3 gap-3">
            <Stat boxed size="sm" label="Average" value={round(stats.average)} />
            <Stat boxed size="sm" label="Min" value={round(stats.min)} />
            <Stat boxed size="sm" label="Max" value={round(stats.max)} />
        </div>
    )
}

function FileSummary({ field, rows }: { field: FormFieldMeta; rows: ReadyRow[] }) {
    const { withFiles, totalFiles } = useMemo(() => {
        let withFiles = 0
        let totalFiles = 0
        for (const row of rows) {
            const n = row.fileCountByField[field.id] ?? 0
            if (n > 0) withFiles += 1
            totalFiles += n
        }
        return { withFiles, totalFiles }
    }, [field, rows])

    return (
        <div className="grid grid-cols-2 gap-3">
            <Stat boxed size="sm" label="With uploads" value={withFiles} />
            <Stat boxed size="sm" label="Total files" value={totalFiles} />
        </div>
    )
}

function TextSamples({ field, rows }: { field: FormFieldMeta; rows: ReadyRow[] }) {
    const samples = useMemo(
        () =>
            rows
                .map((r) => formatAnswerText(r.answers[field.id]))
                .filter((s) => s.trim() !== "")
                .slice(0, 8),
        [field, rows],
    )

    return (
        <ul className="max-h-48 space-y-2 overflow-y-auto pr-1">
            {samples.map((sample, i) => (
                <li
                    key={i}
                    className="rounded-lg border border-border/40 bg-secondary/20 px-3 py-2 text-sm text-foreground/90"
                >
                    <span className="line-clamp-3">{sample}</span>
                </li>
            ))}
        </ul>
    )
}

function round(n: number): number {
    return Math.round(n * 100) / 100
}
