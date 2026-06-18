import { AlertCircle, Paperclip } from "lucide-react"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AnswerCell } from "./answer-display"
import type { DecodedState } from "./use-responses"
import type { FormFieldMeta, SubmissionMeta } from "./shared"

export interface ResponseRow {
    meta: SubmissionMeta
    decoded: DecodedState | undefined
}

function fileCountForField(decoded: Extract<DecodedState, { status: "ready" }>, fieldId: string): number {
    return decoded.attachments?.files.filter((f) => f.fieldId === fieldId).length ?? 0
}

export function ResponsesTable({
    fields,
    rows,
    selectedId,
    onOpen,
}: {
    fields: FormFieldMeta[]
    rows: ResponseRow[]
    selectedId: string | null
    onOpen: (id: string) => void
}) {
    return (
        <div className="overflow-hidden rounded-xl border border-border/60 bg-card luxury-shadow-sm">
            <Table>
                <TableHeader>
                    <TableRow className="border-border/60 bg-secondary/30 hover:bg-secondary/30">
                        <TableHead className="sticky left-0 z-20 w-[15rem] min-w-[13rem] bg-secondary/30 px-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                            Received
                        </TableHead>
                        {fields.map((field) => (
                            <TableHead
                                key={field.id}
                                className="min-w-[12rem] max-w-[22rem] px-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
                            >
                                <span className="block truncate" title={field.label}>
                                    {field.label}
                                </span>
                            </TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map(({ meta, decoded }) => {
                        const unread = !meta.readAt
                        const selected = meta.id === selectedId
                        const received = new Date(meta.createdAt).toLocaleString()
                        return (
                            <TableRow
                                key={meta.id}
                                onClick={() => onOpen(meta.id)}
                                className={cn(
                                    "group cursor-pointer border-border/40",
                                    selected ? "bg-secondary/50 hover:bg-secondary/50" : "hover:bg-secondary/30",
                                )}
                            >
                                <TableCell
                                    className={cn(
                                        "sticky left-0 z-10 w-[15rem] min-w-[13rem] px-4 py-3 align-top transition-colors",
                                        selected ? "bg-secondary/50" : "bg-card group-hover:bg-secondary/30",
                                    )}
                                >
                                    {/* Real button keeps the row keyboard-operable without overriding table semantics. */}
                                    <button
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation()
                                            onOpen(meta.id)
                                        }}
                                        aria-label={`Open response received ${received}`}
                                        className="flex w-full items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                        <span
                                            className={cn(
                                                "h-1.5 w-1.5 shrink-0 rounded-full",
                                                unread ? "bg-emerald-500" : "bg-transparent",
                                            )}
                                            aria-hidden
                                        />
                                        <span className={cn("truncate", unread ? "font-medium" : "text-muted-foreground")}>
                                            {received}
                                        </span>
                                        {meta.hasAttachedDrop ? (
                                            <Paperclip className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                        ) : null}
                                    </button>
                                </TableCell>

                                {decoded === undefined ? (
                                    <TableCell colSpan={fields.length} className="px-4 py-3">
                                        <Skeleton className="h-3 w-40" />
                                    </TableCell>
                                ) : decoded.status === "error" ? (
                                    <TableCell colSpan={fields.length} className="px-4 py-3">
                                        <span className="inline-flex items-center gap-1.5 text-xs text-destructive">
                                            <AlertCircle className="h-3.5 w-3.5" />
                                            {decoded.error}
                                        </span>
                                    </TableCell>
                                ) : (
                                    fields.map((field) => (
                                        <TableCell
                                            key={field.id}
                                            className="max-w-[22rem] px-4 py-3 align-top text-foreground/90"
                                        >
                                            {field.type === "file" ? (
                                                <FileCell count={fileCountForField(decoded, field.id)} />
                                            ) : (
                                                <AnswerCell field={field} value={decoded.answers[field.id]} />
                                            )}
                                        </TableCell>
                                    ))
                                )}
                            </TableRow>
                        )
                    })}
                </TableBody>
            </Table>
        </div>
    )
}

function FileCell({ count }: { count: number }) {
    if (count === 0) return <span className="text-muted-foreground/50">—</span>
    return (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Paperclip className="h-3.5 w-3.5" />
            {count} file{count === 1 ? "" : "s"}
        </span>
    )
}
