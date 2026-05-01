"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useEffect, useCallback, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
    ArrowLeft,
    Check,
    Code2,
    Copy,
    Download,
    ExternalLink,
    Pencil,
    Power,
    Trash2,
    RefreshCw,
    Mail,
    MailOpen,
    Paperclip,
    Loader2,
    MoreHorizontal,
    Inbox,
    FileText,
    AlertCircle,
} from "lucide-react"
import { toggleFormAction, deleteFormAction, deleteSubmissionAction } from "@/actions/form"
import { useVault } from "@/components/vault/vault-provider"
import { fetchWrappedFormKey } from "@/lib/vault/form-keys-client"
import { unwrapVaultPayload, arrayBufferToBase64Url } from "@/lib/vault/crypto"
import { decryptFromSubmission } from "@/lib/crypto/asymmetric"
import { formatFormAnswerLabel } from "@/lib/form-answer-labels"
import { cn } from "@/lib/utils"

const DEFAULT_APP_ORIGIN = "https://anon.li"

interface FormMeta {
    id: string
    title: string
    description: string | null
    active: boolean
    disabledByUser: boolean
    takenDown: boolean
    submissionsCount: number
    allowFileUploads: boolean
    createdAt: string
    hasOwnerKey: boolean
    fieldLabels: Record<string, string>
    fieldOrder: string[]
}

interface SubmissionMeta {
    id: string
    createdAt: string
    readAt: string | null
    hasAttachedDrop: boolean
}

export function FormDetailClient({
    form: initial,
    submissions: initialSubmissions,
    total,
}: {
    form: FormMeta
    submissions: SubmissionMeta[]
    total: number
}) {
    const router = useRouter()
    const vault = useVault()
    const [form, setForm] = useState(initial)
    const [submissions, setSubmissions] = useState(initialSubmissions)
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const [isPending, startTransition] = useTransition()

    const onToggle = () =>
        startTransition(async () => {
            const result = await toggleFormAction(form.id)
            if (result.error) {
                toast.error(result.error)
                return
            }
            const nextDisabled = result.data?.disabled ?? !form.disabledByUser
            setForm((prev) => ({ ...prev, disabledByUser: nextDisabled }))
            toast.success(nextDisabled ? "Form paused" : "Form enabled")
        })

    const onDelete = () =>
        startTransition(async () => {
            const result = await deleteFormAction(form.id)
            if (result.error) {
                toast.error(result.error)
                return
            }
            toast.success("Form deleted")
            router.push("/dashboard/form")
        })

    const onRefresh = () => {
        router.refresh()
        toast.success("Refreshed")
    }

    const unreadCount = submissions.filter((submission) => !submission.readAt).length
    const attachmentCount = submissions.filter((submission) => submission.hasAttachedDrop).length

    let statusLabel: string
    let statusDot: string
    if (form.takenDown) {
        statusLabel = "Taken down"
        statusDot = "bg-destructive"
    } else if (form.disabledByUser) {
        statusLabel = "Paused"
        statusDot = "bg-muted-foreground"
    } else {
        statusLabel = "Live"
        statusDot = "bg-emerald-500"
    }

    return (
        <>
            <div className="mx-auto w-full max-w-6xl space-y-8 pb-20">
                <div className="space-y-6">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-2 h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                        asChild
                    >
                        <Link href="/dashboard/form">
                            <ArrowLeft className="h-4 w-4" />
                            All forms
                        </Link>
                    </Button>

                    <header className="space-y-4 border-b border-border/40 pb-6">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0 space-y-1">
                                <h1 className="text-3xl font-medium tracking-tight font-serif">
                                    {form.title || "(untitled)"}
                                </h1>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                    <span className="inline-flex items-center gap-1.5">
                                        <span className={cn("h-1.5 w-1.5 rounded-full", statusDot)} />
                                        {statusLabel}
                                    </span>
                                    <span>·</span>
                                    <span>Created {new Date(form.createdAt).toLocaleDateString()}</span>
                                </div>
                                {form.description ? (
                                    <p className="max-w-2xl pt-1 text-sm font-light text-muted-foreground">
                                        {form.description}
                                    </p>
                                ) : null}
                            </div>
                            <div className="flex shrink-0 flex-wrap items-center gap-2">
                                <Button variant="outline" size="sm" asChild>
                                    <Link href={`/dashboard/form/${form.id}/edit`}>
                                        <Pencil className="mr-1.5 h-3.5 w-3.5" />
                                        Edit
                                    </Link>
                                </Button>
                                <Button variant="outline" size="sm" asChild>
                                    <Link href={`/f/${form.id}`} target="_blank" rel="noopener noreferrer">
                                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                                        Public link
                                    </Link>
                                </Button>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className="h-9 w-9"
                                            aria-label="More actions"
                                        >
                                            <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={onToggle} disabled={isPending}>
                                            <Power className="mr-2 h-4 w-4" />
                                            {form.disabledByUser ? "Enable" : "Pause"}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={onRefresh}>
                                            <RefreshCw className="mr-2 h-4 w-4" />
                                            Refresh
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                            className="text-destructive focus:text-destructive"
                                            onClick={() => setShowDeleteDialog(true)}
                                        >
                                            <Trash2 className="mr-2 h-4 w-4" />
                                            Delete form
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>
                    </header>

                    <div className="grid grid-cols-3 gap-4">
                        <Metric label="Submissions" value={total} />
                        <Metric label="Unread" value={unreadCount} accent={unreadCount > 0} />
                        <Metric label="Attachments" value={attachmentCount} />
                    </div>
                </div>

                <ShareCard formId={form.id} />

                <section className="space-y-4">
                    <div className="flex items-end justify-between gap-3">
                        <div>
                            <h2 className="font-serif text-2xl font-medium tracking-tight">
                                Inbox
                            </h2>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Decrypt responses locally with your unlocked vault.
                            </p>
                        </div>
                        {submissions.length > 0 ? (
                            <ExportMenu form={form} total={total} vault={vault} />
                        ) : null}
                    </div>

                    {submissions.length === 0 ? (
                        <EmptyInbox formId={form.id} />
                    ) : (
                        <ul className="divide-y divide-border/40 overflow-hidden rounded-2xl border border-border/60 bg-background">
                            {submissions.map((sub) => (
                                <li key={sub.id}>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedId(sub.id)}
                                        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-secondary/40 focus-visible:bg-secondary/40 focus-visible:outline-none"
                                    >
                                        <span
                                            className={cn(
                                                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
                                                sub.readAt
                                                    ? "border-border/50 bg-background text-muted-foreground"
                                                    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                                            )}
                                        >
                                            {sub.readAt ? (
                                                <MailOpen className="h-3.5 w-3.5" />
                                            ) : (
                                                <Mail className="h-3.5 w-3.5" />
                                            )}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p
                                                className={cn(
                                                    "truncate text-sm",
                                                    sub.readAt ? "text-muted-foreground" : "font-medium",
                                                )}
                                            >
                                                {new Date(sub.createdAt).toLocaleString()}
                                            </p>
                                            <p className="text-[11px] text-muted-foreground">
                                                {sub.readAt ? "Read" : "Unread"}
                                            </p>
                                        </div>
                                        {sub.hasAttachedDrop ? (
                                            <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                        ) : null}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </div>

            <Sheet
                open={selectedId !== null}
                onOpenChange={(open) => {
                    if (!open) setSelectedId(null)
                }}
            >
                <SheetContent
                    side="right"
                    className="w-full max-w-2xl overflow-y-auto p-0 sm:max-w-2xl"
                >
                    <SheetHeader className="sr-only">
                        <SheetTitle>Submission details</SheetTitle>
                        <SheetDescription>
                            View and manage the selected encrypted form submission.
                        </SheetDescription>
                    </SheetHeader>
                    {selectedId ? (
                        <SubmissionViewer
                            key={selectedId}
                            submissionId={selectedId}
                            formId={form.id}
                            fieldLabels={form.fieldLabels}
                            vault={vault}
                            onDelete={(id) => {
                                setSubmissions((prev) => prev.filter((s) => s.id !== id))
                                setSelectedId(null)
                            }}
                            onClose={() => setSelectedId(null)}
                        />
                    ) : null}
                </SheetContent>
            </Sheet>

            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this form?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete
                            <span className="font-semibold text-foreground">
                                {" "}
                                {form.title || "(untitled)"}
                            </span>{" "}
                            and all {total} of its submissions. This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={onDelete}
                            disabled={isPending}
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

function Metric({
    label,
    value,
    accent,
}: {
    label: string
    value: number
    accent?: boolean
}) {
    return (
        <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
            <p
                className={cn(
                    "font-mono text-3xl font-medium tabular-nums tracking-tight",
                    accent && "text-emerald-600 dark:text-emerald-400",
                )}
            >
                {value.toLocaleString()}
            </p>
        </div>
    )
}

function EmptyInbox({ formId }: { formId: string }) {
    return (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-secondary/10 px-6 py-16 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border/60 bg-background">
                <Inbox className="h-5 w-5 text-muted-foreground" />
            </div>
            <h3 className="font-serif text-2xl font-medium tracking-tight">
                Waiting for responses
            </h3>
            <p className="mx-auto mt-2 max-w-sm text-sm font-light text-muted-foreground">
                Share the public link to start receiving end-to-end encrypted submissions.
            </p>
            <div className="mt-6">
                <Button asChild variant="outline">
                    <Link href={`/f/${formId}`} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Open public link
                    </Link>
                </Button>
            </div>
        </div>
    )
}

interface SubmissionDetailPayload {
    id: string
    ephemeral_pub_key: string
    iv: string
    encrypted_payload: string
    attached_drop_id: string | null
    created_at: string
    read_at: string | null
}

interface DecryptedAttachmentPayload {
    dropId: string
    key: string
    files: {
        fieldId: string
        fieldLabel?: string
        fileId: string
        name: string
        size: number
        mimeType: string
    }[]
}

function SubmissionViewer({
    submissionId,
    formId,
    fieldLabels,
    vault,
    onDelete,
    onClose,
}: {
    submissionId: string
    formId: string
    fieldLabels: Record<string, string>
    vault: ReturnType<typeof useVault>
    onDelete: (id: string) => void
    onClose: () => void
}) {
    const [state, setState] = useState<
        | { kind: "loading" }
        | { kind: "error"; message: string }
        | {
              kind: "ready"
              data: {
                  answers: Record<string, unknown>
                  createdAt: string
                  attachedDropId: string | null
                  attachments: DecryptedAttachmentPayload | null
              }
          }
    >({ kind: "loading" })
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)

    const load = useCallback(async () => {
        setState({ kind: "loading" })
        try {
            const [wrapped, res] = await Promise.all([
                fetchWrappedFormKey(formId),
                fetch(`/api/v1/form/submission/${submissionId}`, { credentials: "same-origin" }),
            ])
            if (!res.ok) throw new Error(`Failed to load submission (${res.status})`)
            const body = (await res.json()) as { data: SubmissionDetailPayload }
            const detail = body.data
            if (!wrapped) {
                throw new Error(
                    "Vault key for this form is missing. Did you unlock the vault?",
                )
            }
            const vaultKey = vault.getVaultKey()
            if (!vaultKey) throw new Error("Vault is locked")

            const privKeyBytes = await unwrapVaultPayload(wrapped.wrappedKey, vaultKey)
            const plaintext = await decryptFromSubmission(arrayBufferToBase64Url(privKeyBytes), {
                ephemeralPubKey: detail.ephemeral_pub_key,
                iv: detail.iv,
                encryptedPayload: detail.encrypted_payload,
            })
            const parsed = JSON.parse(plaintext) as {
                version: number
                answers: Record<string, unknown>
                attachments?: DecryptedAttachmentPayload | null
            }
            setState({
                kind: "ready",
                data: {
                    answers: parsed.answers ?? {},
                    createdAt: detail.created_at,
                    attachedDropId: detail.attached_drop_id,
                    attachments: parsed.attachments ?? null,
                },
            })
        } catch (err) {
            setState({
                kind: "error",
                message: err instanceof Error ? err.message : "Failed to decrypt",
            })
        }
    }, [formId, submissionId, vault])

    useEffect(() => {
        void Promise.resolve().then(load)
    }, [load])

    const handleDelete = async () => {
        setIsDeleting(true)
        try {
            const result = await deleteSubmissionAction(submissionId)
            if (result.error) {
                toast.error(result.error)
                return
            }
            toast.success("Submission deleted")
            onDelete(submissionId)
        } finally {
            setIsDeleting(false)
            setShowDeleteDialog(false)
        }
    }

    return (
        <>
            <div className="flex h-full flex-col">
                <header className="border-b border-border/40 px-6 py-4">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        Submission
                    </p>
                    <p className="mt-1 font-mono text-sm tabular-nums">
                        {state.kind === "ready"
                            ? new Date(state.data.createdAt).toLocaleString()
                            : "Loading…"}
                    </p>
                </header>

                <div className="flex-1 overflow-y-auto px-6 py-5">
                    {state.kind === "loading" ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Decrypting…
                        </div>
                    ) : null}

                    {state.kind === "error" ? (
                        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                            <div className="flex items-start gap-2 text-sm text-destructive">
                                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                <div className="space-y-1">
                                    <p className="font-medium">Couldn&apos;t decrypt this submission</p>
                                    <p className="text-xs opacity-80">{state.message}</p>
                                </div>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={load}
                                className="mt-3 h-8"
                            >
                                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                                Retry
                            </Button>
                        </div>
                    ) : null}

                    {state.kind === "ready" ? (
                        <div className="space-y-6">
                            <dl className="space-y-5">
                                {Object.entries(state.data.answers).map(([key, value]) => (
                                    <div key={key} className="space-y-1.5">
                                        <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
                                            {formatFormAnswerLabel(key, fieldLabels)}
                                        </dt>
                                        <dd className="whitespace-pre-wrap break-words font-serif text-base leading-relaxed">
                                            {formatAnswerValue(value)}
                                        </dd>
                                    </div>
                                ))}
                            </dl>

                            {state.data.attachedDropId && state.data.attachments ? (
                                <div className="space-y-3 border-t border-border/40 pt-5">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="inline-flex items-center gap-2 text-sm font-medium">
                                            <Paperclip className="h-4 w-4 text-muted-foreground" />
                                            Attached files
                                        </p>
                                        <Button variant="outline" size="sm" asChild>
                                            <Link
                                                href={`/d/${state.data.attachments.dropId}#${state.data.attachments.key}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                                                Open drop
                                            </Link>
                                        </Button>
                                    </div>
                                    <div className="space-y-1.5">
                                        {state.data.attachments.files.map((file) => (
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
                    ) : null}
                </div>

                <footer className="flex items-center justify-between gap-3 border-t border-border/40 px-6 py-3">
                    <Button variant="ghost" size="sm" onClick={onClose}>
                        Close
                    </Button>
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

function ShareCard({ formId }: { formId: string }) {
    const [origin] = useState(() =>
        typeof window === "undefined" ? DEFAULT_APP_ORIGIN : window.location.origin,
    )
    const shareUrl = `${origin}/f/${formId}`
    const embedSnippet = `<iframe src="${shareUrl}" width="100%" height="720" style="border:0"></iframe>`

    return (
        <section className="space-y-3 rounded-2xl border border-border/60 bg-card p-5">
            <div className="space-y-1">
                <h2 className="font-serif text-lg font-medium tracking-tight">Share</h2>
                <p className="text-xs text-muted-foreground">
                    Public link is open to anyone — submissions are encrypted to you.
                </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
                <CopyField label="Public link" value={shareUrl} />
                <CopyField label="Embed snippet" value={embedSnippet} monospace />
            </div>
        </section>
    )
}

function CopyField({
    label,
    value,
    monospace,
}: {
    label: string
    value: string
    monospace?: boolean
}) {
    const [copied, setCopied] = useState(false)
    const onCopy = async () => {
        try {
            await navigator.clipboard.writeText(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 1_500)
            toast.success(`${label} copied`)
        } catch {
            toast.error("Copy failed. Select and copy manually.")
        }
    }
    return (
        <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {label}
            </label>
            <div className="flex items-center gap-2">
                <input
                    readOnly
                    value={value}
                    className={cn(
                        "h-9 w-full rounded-md border border-border/50 bg-background px-3 text-xs",
                        monospace && "font-mono",
                    )}
                    onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={onCopy}
                    className="h-9 w-9 shrink-0"
                    aria-label={`Copy ${label.toLowerCase()}`}
                >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
            </div>
        </div>
    )
}

function ExportMenu({
    form,
    total,
    vault,
}: {
    form: FormMeta
    total: number
    vault: ReturnType<typeof useVault>
}) {
    const [busy, setBusy] = useState<null | "json" | "csv">(null)

    const run = async (format: "json" | "csv") => {
        if (busy) return
        setBusy(format)
        const toastId = toast.loading(`Preparing export of ${total} submissions…`)
        try {
            const vaultKey = vault.getVaultKey()
            if (!vaultKey) throw new Error("Unlock your vault to export submissions")
            const wrapped = await fetchWrappedFormKey(form.id)
            if (!wrapped) throw new Error("Form key is missing")
            const privKeyBytes = await unwrapVaultPayload(wrapped.wrappedKey, vaultKey)
            const privateKey = arrayBufferToBase64Url(privKeyBytes)

            const allSubmissions = await fetchAllSubmissions(form.id, (loaded, listTotal) => {
                toast.loading(`Listing submissions (${loaded}/${listTotal})…`, { id: toastId })
            })

            const decrypted: DecryptedSubmission[] = []
            for (const [index, sub] of allSubmissions.entries()) {
                toast.loading(`Decrypting ${index + 1}/${allSubmissions.length}…`, { id: toastId })
                const res = await fetch(
                    `/api/v1/form/submission/${sub.id}?markRead=false`,
                    { credentials: "same-origin" },
                )
                if (!res.ok)
                    throw new Error(`Failed to load submission ${sub.id} (${res.status})`)
                const body = (await res.json()) as { data: SubmissionDetailPayload }
                const plaintext = await decryptFromSubmission(privateKey, {
                    ephemeralPubKey: body.data.ephemeral_pub_key,
                    iv: body.data.iv,
                    encryptedPayload: body.data.encrypted_payload,
                })
                const parsed = JSON.parse(plaintext) as {
                    version: number
                    answers: Record<string, unknown>
                    attachments?: DecryptedAttachmentPayload | null
                }
                decrypted.push({
                    id: sub.id,
                    createdAt: sub.createdAt,
                    answers: parsed.answers ?? {},
                    attachments: parsed.attachments ?? null,
                })
            }

            if (format === "json") {
                const payload = decrypted.map((d) => ({
                    id: d.id,
                    created_at: d.createdAt,
                    answers: d.answers,
                    files:
                        d.attachments?.files.map((f) => ({
                            field_id: f.fieldId,
                            field_label: f.fieldLabel ?? form.fieldLabels[f.fieldId] ?? null,
                            name: f.name,
                            size: f.size,
                            mime_type: f.mimeType,
                        })) ?? [],
                }))
                triggerDownload(
                    JSON.stringify(payload, null, 2),
                    `${safeFilename(form.title)}-${timestamp()}.json`,
                    "application/json",
                )
            } else {
                triggerDownload(
                    buildCsv(form, decrypted),
                    `${safeFilename(form.title)}-${timestamp()}.csv`,
                    "text/csv;charset=utf-8",
                )
            }
            toast.success(
                `Exported ${decrypted.length} submission${decrypted.length === 1 ? "" : "s"}`,
                { id: toastId },
            )
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Export failed", { id: toastId })
        } finally {
            setBusy(null)
        }
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5" disabled={busy !== null}>
                    {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Download className="h-4 w-4" />
                    )}
                    {busy ? "Exporting…" : "Download"}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => run("json")} disabled={busy !== null}>
                    <Code2 className="mr-2 h-4 w-4" />
                    Export as JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => run("csv")} disabled={busy !== null}>
                    <FileText className="mr-2 h-4 w-4" />
                    Export as CSV
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

interface DecryptedSubmission {
    id: string
    createdAt: string
    answers: Record<string, unknown>
    attachments: DecryptedAttachmentPayload | null
}

interface SubmissionListEntry {
    id: string
    createdAt: string
}

async function fetchAllSubmissions(
    formId: string,
    onProgress?: (loaded: number, total: number) => void,
): Promise<SubmissionListEntry[]> {
    const pageSize = 100
    let offset = 0
    let total = Infinity
    const all: SubmissionListEntry[] = []
    while (offset < total) {
        const res = await fetch(
            `/api/v1/form/${formId}/submission?limit=${pageSize}&offset=${offset}`,
            { credentials: "same-origin" },
        )
        if (!res.ok) throw new Error(`Failed to list submissions (${res.status})`)
        const body = (await res.json()) as {
            data: { id: string; created_at: string }[]
            meta?: { total?: number }
        }
        const page = body.data ?? []
        all.push(...page.map((entry) => ({ id: entry.id, createdAt: entry.created_at })))
        if (typeof body.meta?.total === "number") {
            total = body.meta.total
        } else if (page.length < pageSize) {
            total = all.length
        }
        offset += page.length || pageSize
        onProgress?.(all.length, Number.isFinite(total) ? total : all.length)
        if (page.length === 0) break
    }
    return all
}

function buildCsv(form: FormMeta, rows: DecryptedSubmission[]): string {
    const orderedIds =
        form.fieldOrder.length > 0
            ? form.fieldOrder
            : Array.from(new Set(rows.flatMap((r) => Object.keys(r.answers))))
    const header = [
        "submission_id",
        "created_at",
        ...orderedIds.map((id) => form.fieldLabels[id] ?? id),
        "attachments",
    ]
    const lines = [header.map(csvEscape).join(",")]
    for (const row of rows) {
        const attachmentNames =
            row.attachments?.files.map((f) => f.name).join("; ") ?? ""
        const cells: string[] = [row.id, row.createdAt]
        for (const id of orderedIds) {
            cells.push(serializeAnswerForCsv(row.answers[id]))
        }
        cells.push(attachmentNames)
        lines.push(cells.map(csvEscape).join(","))
    }
    return lines.join("\r\n")
}

function serializeAnswerForCsv(value: unknown): string {
    if (value === null || value === undefined) return ""
    if (Array.isArray(value)) return value.map(String).join("; ")
    if (typeof value === "boolean") return value ? "true" : "false"
    return String(value)
}

function csvEscape(cell: string): string {
    if (/[",\r\n]/.test(cell)) {
        return `"${cell.replace(/"/g, '""')}"`
    }
    return cell
}

function triggerDownload(content: string, filename: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.rel = "noopener"
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

function safeFilename(input: string): string {
    const slug = input
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48)
    return slug || "form"
}

function timestamp(): string {
    return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
}

function formatAnswerValue(value: unknown): string {
    if (value === null || value === undefined) return "—"
    if (Array.isArray(value)) return value.length === 0 ? "—" : value.join(", ")
    if (typeof value === "boolean") return value ? "Yes" : "No"
    const str = String(value)
    return str.trim() === "" ? "—" : str
}

function formatBytes(size: number): string {
    if (!Number.isFinite(size) || size <= 0) return "0 B"
    const units = ["B", "KB", "MB", "GB", "TB"]
    let value = size
    let unit = 0
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024
        unit++
    }
    return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit] ?? "B"}`
}
