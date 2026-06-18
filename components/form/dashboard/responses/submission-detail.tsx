import Link from "next/link"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
    AlertCircle,
    ChevronLeft,
    ChevronRight,
    ExternalLink,
    Loader2,
    Paperclip,
    RefreshCw,
    Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { deleteSubmissionAction } from "@/actions/form"
import { AnswerBlock } from "./answer-display"
import type { DecodedState } from "./use-responses"
import type { FormFieldMeta, SubmissionMeta } from "./shared"
import { formatBytes } from "./shared"

export function SubmissionDetail({
    fields,
    meta,
    decoded,
    position,
    hasPrev,
    hasNext,
    onPrev,
    onNext,
    onRetry,
    onDelete,
}: {
    fields: FormFieldMeta[]
    meta: SubmissionMeta
    decoded: DecodedState | undefined
    position: { index: number; count: number }
    hasPrev: boolean
    hasNext: boolean
    onPrev: () => void
    onNext: () => void
    onRetry: () => void
    onDelete: (id: string) => void
}) {
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)

    // Arrow keys move between responses while the panel is open.
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null
            if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
                return
            }
            if (e.key === "ArrowLeft" && hasPrev) {
                e.preventDefault()
                onPrev()
            } else if (e.key === "ArrowRight" && hasNext) {
                e.preventDefault()
                onNext()
            }
        }
        window.addEventListener("keydown", handler)
        return () => window.removeEventListener("keydown", handler)
    }, [hasPrev, hasNext, onPrev, onNext])

    const handleDelete = async () => {
        setIsDeleting(true)
        try {
            const result = await deleteSubmissionAction(meta.id)
            if (result.error) {
                toast.error(result.error)
                return
            }
            toast.success("Submission deleted")
            onDelete(meta.id)
        } finally {
            setIsDeleting(false)
            setShowDeleteDialog(false)
        }
    }

    return (
        <>
            <div className="flex h-full flex-col">
                <header className="flex items-center justify-between gap-3 border-b border-border/40 px-6 py-4">
                    <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                            Response {position.index + 1} of {position.count}
                        </p>
                        <p className="mt-1 truncate font-mono text-sm tabular-nums">
                            {new Date(meta.createdAt).toLocaleString()}
                        </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={onPrev}
                            disabled={!hasPrev}
                            aria-label="Previous response"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={onNext}
                            disabled={!hasNext}
                            aria-label="Next response"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto px-6 py-5">
                    {decoded === undefined ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Decrypting…
                        </div>
                    ) : decoded.status === "error" ? (
                        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                            <div className="flex items-start gap-2 text-sm text-destructive">
                                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                <div className="space-y-1">
                                    <p className="font-medium">Couldn&apos;t decrypt this submission</p>
                                    <p className="text-xs opacity-80">{decoded.error}</p>
                                </div>
                            </div>
                            <Button variant="outline" size="sm" onClick={onRetry} className="mt-3 h-8">
                                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                                Retry
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <dl className="space-y-5">
                                {fields.map((field) => (
                                    <div key={field.id} className="space-y-1.5">
                                        <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
                                            {field.label}
                                        </dt>
                                        <dd>
                                            {field.type === "file" ? (
                                                <FileAnswer decoded={decoded} fieldId={field.id} />
                                            ) : (
                                                <AnswerBlock field={field} value={decoded.answers[field.id]} />
                                            )}
                                        </dd>
                                    </div>
                                ))}
                            </dl>

                            {decoded.attachments && decoded.attachments.files.length > 0 ? (
                                <div className="space-y-3 border-t border-border/40 pt-5">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="inline-flex items-center gap-2 text-sm font-medium">
                                            <Paperclip className="h-4 w-4 text-muted-foreground" />
                                            Attached files
                                        </p>
                                        <Button variant="outline" size="sm" asChild>
                                            <Link
                                                href={`/d/${decoded.attachments.dropId}#${decoded.attachments.key}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                                                Open drop
                                            </Link>
                                        </Button>
                                    </div>
                                    <div className="space-y-1.5">
                                        {decoded.attachments.files.map((file) => (
                                            <div
                                                key={file.fileId}
                                                className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-secondary/20 px-3 py-2.5 text-sm"
                                            >
                                                <div className="min-w-0">
                                                    <p className="truncate font-medium">{file.name}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {file.fieldLabel ?? file.fieldId}
                                                    </p>
                                                </div>
                                                <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                                                    {formatBytes(file.size)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    )}
                </div>

                <footer className="flex items-center justify-end border-t border-border/40 px-6 py-3">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowDeleteDialog(true)}
                        className="text-muted-foreground hover:text-destructive"
                    >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        Delete
                    </Button>
                </footer>
            </div>

            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this submission?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently remove this submission and any attached files. This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={isDeleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}

function FileAnswer({
    decoded,
    fieldId,
}: {
    decoded: Extract<DecodedState, { status: "ready" }>
    fieldId: string
}) {
    const files = decoded.attachments?.files.filter((f) => f.fieldId === fieldId) ?? []
    if (files.length === 0) return <span className="text-sm italic text-muted-foreground">No files</span>
    return (
        <ul className="space-y-1">
            {files.map((file) => (
                <li key={file.fileId} className="inline-flex items-center gap-2 text-sm">
                    <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">{file.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{formatBytes(file.size)}</span>
                </li>
            ))}
        </ul>
    )
}
