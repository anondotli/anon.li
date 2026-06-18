"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useMemo, useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { EmptyState } from "@/components/ui/empty-state"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { Stat } from "@/components/ui/stat"
import { CopyField } from "@/components/ui/copy-field"
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
    AlertTriangle,
    ArrowLeft,
    ExternalLink,
    Inbox,
    Loader2,
    MoreHorizontal,
    Pencil,
    Power,
    RefreshCw,
    Search,
    Share2,
    Trash2,
} from "lucide-react"
import { toggleFormAction, deleteFormAction } from "@/actions/form"
import { useResponses } from "./use-responses"
import { ResponsesTable, type ResponseRow } from "./responses-table"
import { ResponsesSummary } from "./summary"
import { SubmissionDetail } from "./submission-detail"
import { ExportMenu } from "./export-menu"
import { getFormStatus, StatusDot } from "@/components/form/dashboard/form-status"
import type { FormMeta, ResponseStats, SubmissionMeta } from "./shared"
import { buildSearchHaystack } from "./shared"

const DEFAULT_APP_ORIGIN = "https://anon.li"

type FilterKey = "all" | "unread" | "files"

export function FormResponsesClient({
    form: initial,
    submissions: initialSubmissions,
    stats: initialStats,
}: {
    form: FormMeta
    submissions: SubmissionMeta[]
    stats: ResponseStats
}) {
    const router = useRouter()
    const [form, setForm] = useState(initial)
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const [isPending, startTransition] = useTransition()

    const {
        submissions,
        decoded,
        keyError,
        pendingCount,
        stats,
        hasMore,
        loadingMore,
        loadMore,
        markRead,
        removeSubmission,
        retry,
        ensureAllDecrypted,
    } = useResponses(form.id, initialSubmissions, initialStats)

    const [tab, setTab] = useState<"table" | "summary">("table")
    const [filter, setFilter] = useState<FilterKey>("all")
    const [query, setQuery] = useState("")

    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [navOrder, setNavOrder] = useState<string[]>([])

    // Rows matching the current filter + search, in newest-first order.
    const visibleRows = useMemo<ResponseRow[]>(() => {
        const needle = query.trim().toLowerCase()
        return submissions
            .filter((s) => {
                if (filter === "unread" && s.readAt) return false
                if (filter === "files" && !s.hasAttachedDrop) return false
                if (needle) {
                    const d = decoded[s.id]
                    if (!d || d.status !== "ready") return false
                    if (!buildSearchHaystack(d.answers).includes(needle)) return false
                }
                return true
            })
            .map((s) => ({ meta: s, decoded: decoded[s.id] }))
    }, [submissions, decoded, filter, query])

    const open = useCallback(
        (id: string) => {
            setNavOrder(visibleRows.map((r) => r.meta.id))
            setSelectedId(id)
            markRead(id)
        },
        [visibleRows, markRead],
    )

    // Navigation snapshot keeps arrowing stable even as rows get marked read.
    const liveNav = useMemo(() => {
        const present = new Set(submissions.map((s) => s.id))
        return navOrder.filter((id) => present.has(id))
    }, [navOrder, submissions])

    const navIndex = selectedId ? liveNav.indexOf(selectedId) : -1
    const goTo = useCallback(
        (index: number) => {
            const id = liveNav[index]
            if (!id) return
            setSelectedId(id)
            markRead(id)
        },
        [liveNav, markRead],
    )

    const handleDeleteSubmission = useCallback(
        (id: string) => {
            const idx = liveNav.indexOf(id)
            const nextId = liveNav[idx + 1] ?? liveNav[idx - 1] ?? null
            removeSubmission(id)
            setSelectedId(nextId)
            if (nextId) markRead(nextId)
        },
        [liveNav, removeSubmission, markRead],
    )

    const selectedMeta = useMemo(
        () => submissions.find((s) => s.id === selectedId) ?? null,
        [submissions, selectedId],
    )

    const readyRows = useMemo(
        () =>
            visibleRows
                .filter((r) => r.decoded?.status === "ready")
                .map((r) => {
                    const d = r.decoded as Extract<typeof r.decoded, { status: "ready" }>
                    const fileCountByField: Record<string, number> = {}
                    for (const f of d.attachments?.files ?? []) {
                        fileCountByField[f.fieldId] = (fileCountByField[f.fieldId] ?? 0) + 1
                    }
                    return {
                        id: r.meta.id,
                        answers: d.answers,
                        hasFiles: (d.attachments?.files.length ?? 0) > 0,
                        fileCountByField,
                    }
                }),
        [visibleRows],
    )

    const searchPending = query.trim().length > 0 && pendingCount > 0

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

    const onDeleteForm = () =>
        startTransition(async () => {
            const result = await deleteFormAction(form.id)
            if (result.error) {
                toast.error(result.error)
                return
            }
            toast.success("Form deleted")
            router.push("/dashboard/form")
        })

    const status = getFormStatus(form)

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
                                <h1 className="font-serif text-3xl font-medium tracking-tight">
                                    {form.title || "(untitled)"}
                                </h1>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                    <StatusDot status={status} />
                                    <span aria-hidden>·</span>
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
                                        <Button variant="outline" size="icon" className="h-9 w-9" aria-label="More actions">
                                            <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={onToggle} disabled={isPending}>
                                            <Power className="mr-2 h-4 w-4" />
                                            {form.disabledByUser ? "Enable" : "Pause"}
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

                    <div className="grid grid-cols-3 divide-x divide-border/40 overflow-hidden rounded-xl border border-border/60 bg-card luxury-shadow-sm">
                        <div className="px-4 py-4 sm:px-5">
                            <Stat label="Submissions" value={stats.total} />
                        </div>
                        <div className="px-4 py-4 sm:px-5">
                            <Stat label="Unread" value={stats.unread} accent={stats.unread > 0} />
                        </div>
                        <div className="px-4 py-4 sm:px-5">
                            <Stat label="Attachments" value={stats.withAttachments} />
                        </div>
                    </div>
                </div>

                <ShareCard formId={form.id} />

                {keyError ? (
                    <Alert variant="warning">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>{keyError}</AlertDescription>
                    </Alert>
                ) : null}

                <section className="space-y-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <Tabs value={tab} onValueChange={(v) => setTab(v as "table" | "summary")}>
                            <TabsList>
                                <TabsTrigger value="table">Responses</TabsTrigger>
                                <TabsTrigger value="summary">Summary</TabsTrigger>
                            </TabsList>
                        </Tabs>
                        <div className="flex items-center gap-2">
                            {pendingCount > 0 ? (
                                <span
                                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
                                    aria-live="polite"
                                >
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Decrypting {pendingCount}…
                                </span>
                            ) : null}
                            {submissions.length > 0 ? (
                                <ExportMenu form={form} ensureAllDecrypted={ensureAllDecrypted} />
                            ) : null}
                        </div>
                    </div>

                    {submissions.length === 0 ? (
                        <EmptyState
                            variant="panel"
                            icon={Inbox}
                            title="Waiting for responses"
                            description="Share the public link to start receiving end-to-end encrypted submissions."
                            action={
                                <Button asChild variant="outline">
                                    <Link href={`/f/${form.id}`} target="_blank" rel="noopener noreferrer">
                                        <ExternalLink className="mr-2 h-4 w-4" />
                                        Open public link
                                    </Link>
                                </Button>
                            }
                        />
                    ) : (
                        <>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="relative w-full sm:max-w-xs">
                                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        placeholder="Search responses…"
                                        className="h-9 pl-9"
                                        aria-label="Search responses"
                                    />
                                </div>
                                <SegmentedControl
                                    aria-label="Filter responses"
                                    value={filter}
                                    onChange={setFilter}
                                    items={[
                                        { value: "all", label: "All", count: stats.total },
                                        { value: "unread", label: "Unread", count: stats.unread },
                                        { value: "files", label: "Files", count: stats.withAttachments },
                                    ]}
                                />
                            </div>

                            {searchPending ? (
                                <p className="text-xs text-muted-foreground" aria-live="polite">
                                    Searching decrypted responses — {pendingCount} still decrypting…
                                </p>
                            ) : null}

                            {visibleRows.length === 0 ? (
                                <EmptyState
                                    variant="panel"
                                    icon={Search}
                                    title="No matching responses"
                                    description="Adjust the search or clear the active filter."
                                    className="py-12"
                                />
                            ) : tab === "table" ? (
                                <ResponsesTable
                                    fields={form.fields}
                                    rows={visibleRows}
                                    selectedId={selectedId}
                                    onOpen={open}
                                />
                            ) : (
                                <ResponsesSummary fields={form.fields} rows={readyRows} />
                            )}

                            {hasMore ? (
                                <div className="flex justify-center pt-2">
                                    <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                                        {loadingMore ? (
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        ) : null}
                                        Load more ({submissions.length} of {stats.total})
                                    </Button>
                                </div>
                            ) : null}
                        </>
                    )}
                </section>
            </div>

            <Sheet
                open={selectedId !== null}
                onOpenChange={(isOpen) => {
                    if (!isOpen) setSelectedId(null)
                }}
            >
                <SheetContent side="right" className="w-full max-w-2xl overflow-y-auto p-0 sm:max-w-2xl">
                    <SheetHeader className="sr-only">
                        <SheetTitle>Submission details</SheetTitle>
                        <SheetDescription>View and manage the selected encrypted form submission.</SheetDescription>
                    </SheetHeader>
                    {selectedMeta ? (
                        <SubmissionDetail
                            key={selectedMeta.id}
                            fields={form.fields}
                            meta={selectedMeta}
                            decoded={decoded[selectedMeta.id]}
                            position={{ index: navIndex < 0 ? 0 : navIndex, count: liveNav.length || 1 }}
                            hasPrev={navIndex > 0}
                            hasNext={navIndex >= 0 && navIndex < liveNav.length - 1}
                            onPrev={() => goTo(navIndex - 1)}
                            onNext={() => goTo(navIndex + 1)}
                            onRetry={() => retry(selectedMeta.id)}
                            onDelete={handleDeleteSubmission}
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
                            <span className="font-semibold text-foreground"> {form.title || "(untitled)"}</span> and all{" "}
                            {stats.total} of its submissions. This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={onDeleteForm}
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

function ShareCard({ formId }: { formId: string }) {
    const [origin] = useState(() => (typeof window === "undefined" ? DEFAULT_APP_ORIGIN : window.location.origin))
    const shareUrl = `${origin}/f/${formId}`
    const embedSnippet = `<iframe src="${shareUrl}" width="100%" height="720" style="border:0"></iframe>`

    return (
        <section className="space-y-3 rounded-xl border border-border/60 bg-card p-5 luxury-shadow-sm">
            <div className="space-y-1">
                <h2 className="inline-flex items-center gap-2 font-serif text-lg font-medium tracking-tight">
                    <Share2 className="h-4 w-4 text-muted-foreground" />
                    Share
                </h2>
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
