"use client"

import Link from "next/link"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import {
    ArrowDownWideNarrow,
    ArrowUpRight,
    Bell,
    CalendarClock,
    Check,
    ExternalLink,
    FileText,
    MoreHorizontal,
    Paperclip,
    Pencil,
    Plus,
    Power,
    Search,
    Sparkles,
    Trash2,
    X,
} from "lucide-react"
import { toggleFormAction, deleteFormAction } from "@/actions/form"
import { formatRelativeTime } from "@/lib/format"
import { EmptyState } from "@/components/ui/empty-state"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { getFormStatus, StatusBadge } from "@/components/form/dashboard/form-status"

export interface FormListItemSerialized {
    id: string
    title: string
    description: string | null
    active: boolean
    disabledByUser: boolean
    takenDown: boolean
    submissionsCount: number
    maxSubmissions: number | null
    hideBranding: boolean
    allowFileUploads: boolean
    notifyOnSubmission: boolean
    createdAt: string
    updatedAt: string
    closesAt: string | null
}

type FilterStatus = "all" | "live" | "paused"
type SortBy = "recent" | "submissions" | "title"

interface SortOption {
    value: SortBy
    label: string
}

const FILTER_TABS: { value: FilterStatus; label: string }[] = [
    { value: "all", label: "All" },
    { value: "live", label: "Live" },
    { value: "paused", label: "Paused" },
]

const DEFAULT_SORT_OPTION: SortOption = { value: "recent", label: "Recent" }

const SORT_OPTIONS: SortOption[] = [
    DEFAULT_SORT_OPTION,
    { value: "submissions", label: "Submissions" },
    { value: "title", label: "A-Z" },
]

const DATE_FORMATTER = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
})

export function FormListClient({ forms: initialForms }: { forms: FormListItemSerialized[] }) {
    const [forms, setForms] = useState(initialForms)
    const [searchQuery, setSearchQuery] = useState("")
    const [filterStatus, setFilterStatus] = useState<FilterStatus>("all")
    const [sortBy, setSortBy] = useState<SortBy>("recent")
    const [now] = useState(() => Date.now())

    const onToggle = async (id: string) => {
        const result = await toggleFormAction(id)
        if (result.error) {
            toast.error(result.error)
            return
        }
        setForms((prev) =>
            prev.map((f) =>
                f.id === id
                    ? { ...f, disabledByUser: result.data?.disabled ?? !f.disabledByUser }
                    : f,
            ),
        )
        toast.success(result.data?.disabled ? "Form paused" : "Form enabled")
    }

    const onDelete = async (id: string) => {
        const result = await deleteFormAction(id)
        if (result.error) {
            toast.error(result.error)
            return
        }
        setForms((prev) => prev.filter((f) => f.id !== id))
        toast.success("Form deleted")
    }

    const filteredForms = useMemo(() => {
        let result = [...forms]

        if (searchQuery) {
            const q = searchQuery.toLowerCase()
            result = result.filter(
                (f) =>
                    (f.title || "").toLowerCase().includes(q) ||
                    (f.description || "").toLowerCase().includes(q),
            )
        }

        if (filterStatus === "live") {
            result = result.filter((f) => getFormStatus(f, now).kind === "live")
        } else if (filterStatus === "paused") {
            result = result.filter((f) => getFormStatus(f, now).kind === "paused")
        }

        switch (sortBy) {
            case "title":
                result.sort((a, b) => (a.title || "").localeCompare(b.title || ""))
                break
            case "submissions":
                result.sort((a, b) => b.submissionsCount - a.submissionsCount)
                break
            case "recent":
            default:
                result.sort(
                    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
                )
        }

        return result
    }, [forms, searchQuery, filterStatus, sortBy, now])

    const hasFilters = searchQuery !== "" || filterStatus !== "all"

    const clearFilters = () => {
        setSearchQuery("")
        setFilterStatus("all")
    }

    if (forms.length === 0) {
        return (
            <EmptyState
                variant="panel"
                icon={FileText}
                title="Build your first form"
                description="Create a private, end-to-end encrypted form. Responses are visible only to you."
                action={
                    <Button asChild size="lg" className="h-11 gap-2">
                        <Link href="/dashboard/form/new">
                            <Plus className="h-4 w-4" />
                            Create a form
                        </Link>
                    </Button>
                }
                className="min-h-[24rem]"
            />
        )
    }

    return (
        <section className="space-y-4">
            <FilterBar
                filterStatus={filterStatus}
                sortBy={sortBy}
                searchQuery={searchQuery}
                visibleCount={filteredForms.length}
                totalCount={forms.length}
                hasFilters={hasFilters}
                onSearchChange={setSearchQuery}
                onFilterChange={setFilterStatus}
                onSortChange={setSortBy}
                onClearFilters={clearFilters}
            />

            {filteredForms.length === 0 ? (
                <EmptyState
                    variant="panel"
                    icon={Search}
                    title="No matching forms"
                    description="Adjust the search or clear the active filters."
                    action={
                        <Button variant="link" onClick={clearFilters}>
                            Clear filters
                        </Button>
                    }
                    className="py-14"
                />
            ) : (
                <div className="overflow-hidden rounded-xl border border-border/60 bg-background luxury-shadow-sm">
                    <div className="hidden grid-cols-[minmax(0,1fr)_6.5rem_6rem_7rem_4.5rem] gap-x-4 border-b border-border/50 bg-gradient-to-b from-secondary/30 to-secondary/10 px-5 py-3 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/80 lg:grid">
                        <span>Form</span>
                        <span>Status</span>
                        <span className="text-right">Responses</span>
                        <span className="text-right">Capacity</span>
                        <span className="text-right">Actions</span>
                    </div>
                    <div className="divide-y divide-border/40">
                        {filteredForms.map((form) => (
                            <FormListRow
                                key={form.id}
                                form={form}
                                now={now}
                                onToggle={() => onToggle(form.id)}
                                onDelete={() => onDelete(form.id)}
                            />
                        ))}
                    </div>
                </div>
            )}
        </section>
    )
}

interface FilterBarProps {
    filterStatus: FilterStatus
    sortBy: SortBy
    searchQuery: string
    visibleCount: number
    totalCount: number
    hasFilters: boolean
    onSearchChange: (value: string) => void
    onFilterChange: (value: FilterStatus) => void
    onSortChange: (value: SortBy) => void
    onClearFilters: () => void
}

function FilterBar({
    filterStatus,
    sortBy,
    searchQuery,
    visibleCount,
    totalCount,
    hasFilters,
    onSearchChange,
    onFilterChange,
    onSortChange,
    onClearFilters,
}: FilterBarProps) {
    const selectedSort = SORT_OPTIONS.find((option) => option.value === sortBy) ?? DEFAULT_SORT_OPTION
    const countLabel = hasFilters
        ? `${visibleCount} of ${totalCount} ${totalCount === 1 ? "form" : "forms"}`
        : `${totalCount} ${totalCount === 1 ? "form" : "forms"}`

    return (
        <div className="rounded-lg border border-border/60 bg-secondary/10 p-3 luxury-shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative min-w-0 flex-1 lg:max-w-md">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Search forms..."
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="h-10 rounded-md border-border/60 bg-background pl-9 pr-8 text-sm shadow-none"
                    />
                    {searchQuery ? (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground"
                            onClick={() => onSearchChange("")}
                            aria-label="Clear search"
                        >
                            <X className="h-3.5 w-3.5" />
                        </Button>
                    ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <SegmentedControl
                        aria-label="Filter forms by status"
                        items={FILTER_TABS}
                        value={filterStatus}
                        onChange={onFilterChange}
                    />

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="outline"
                                className="h-10 rounded-md border-border/60 bg-background px-3 text-xs font-medium shadow-none"
                            >
                                <ArrowDownWideNarrow className="h-3.5 w-3.5" />
                                {selectedSort.label}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                            {SORT_OPTIONS.map((option) => {
                                const active = option.value === sortBy
                                return (
                                    <DropdownMenuItem
                                        key={option.value}
                                        onClick={() => onSortChange(option.value)}
                                        className="justify-between"
                                    >
                                        {option.label}
                                        {active ? <Check className="h-3.5 w-3.5" /> : null}
                                    </DropdownMenuItem>
                                )
                            })}
                        </DropdownMenuContent>
                    </DropdownMenu>

                    {hasFilters ? (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={onClearFilters}
                            className="h-10 rounded-md px-3 text-xs text-muted-foreground"
                        >
                            Clear
                        </Button>
                    ) : null}
                </div>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-3 text-xs text-muted-foreground">
                <span>{countLabel}</span>
                {hasFilters ? <span>Filtered view</span> : <span>Sorted by {selectedSort.label.toLowerCase()}</span>}
            </div>
        </div>
    )
}

function FormListRow({
    form,
    now,
    onToggle,
    onDelete,
}: {
    form: FormListItemSerialized
    now: number
    onToggle: () => Promise<void>
    onDelete: () => Promise<void>
}) {
    const [isPending, startTransition] = useTransition()
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const status = getFormStatus(form, now)
    const remaining = form.maxSubmissions == null
        ? null
        : Math.max(form.maxSubmissions - form.submissionsCount, 0)

    const handleToggle = () => startTransition(() => onToggle())
    const handleDelete = () =>
        startTransition(async () => {
            await onDelete()
            setShowDeleteDialog(false)
        })

    return (
        <>
            <article className="group relative bg-background transition-colors duration-200 hover:bg-secondary/20">
                <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-2 left-0 w-px bg-foreground/40 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                />
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2.5 px-3 py-4 sm:px-5 sm:py-4 lg:grid-cols-[minmax(0,1fr)_6.5rem_6rem_7rem_4.5rem] lg:gap-x-4 lg:items-start lg:py-4">
                    <div className="min-w-0 space-y-1.5">
                        <div className="flex min-w-0 items-center gap-2">
                            <Link
                                href={`/dashboard/form/${form.id}`}
                                className="block min-w-0 flex-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            >
                                <h3 className="truncate text-sm font-medium leading-5 tracking-tight text-foreground transition-colors group-hover:text-foreground">
                                    {form.title || (
                                        <span className="font-light italic text-muted-foreground">Untitled form</span>
                                    )}
                                </h3>
                            </Link>
                            <div className="flex shrink-0 items-center gap-1 lg:hidden">
                                <StatusBadge status={status} />
                            </div>
                        </div>

                        {form.description ? (
                            <p className="hidden max-w-3xl truncate text-xs font-light leading-4 text-muted-foreground/90 sm:block">
                                {form.description}
                            </p>
                        ) : null}

                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] font-light text-muted-foreground">
                            <span>Updated {formatRelativeTime(form.updatedAt)}</span>
                            <span aria-hidden className="hidden text-border sm:inline">·</span>
                            <span className="hidden sm:inline">Created {formatShortDate(form.createdAt)}</span>
                            {form.closesAt ? (
                                <>
                                    <span aria-hidden className="text-border">·</span>
                                    <span className="inline-flex items-center gap-1">
                                        <CalendarClock className="h-3 w-3" />
                                        Closes {formatShortDate(form.closesAt)}
                                    </span>
                                </>
                            ) : null}
                            <CapabilityIcons form={form} />
                        </div>
                    </div>

                    <div className="hidden lg:flex lg:items-center lg:pt-0.5">
                        <StatusBadge status={status} />
                    </div>

                    <div className="order-3 flex items-baseline gap-1.5 text-xs text-muted-foreground lg:order-none lg:flex-col lg:items-end lg:gap-0.5 lg:pt-0.5 lg:text-right">
                        <p className="text-base font-medium leading-5 tabular-nums text-foreground">
                            {form.submissionsCount.toLocaleString()}
                        </p>
                        <p className="text-[10px] font-medium uppercase leading-4 tracking-[0.1em] text-muted-foreground/80">
                            {form.submissionsCount === 1 ? "Submission" : "Submissions"}
                        </p>
                    </div>

                    <div className="order-4 flex items-baseline justify-end gap-1.5 text-xs text-muted-foreground lg:order-none lg:flex-col lg:items-end lg:gap-0.5 lg:pt-0.5 lg:text-right">
                        <p className="text-sm font-medium leading-5 tabular-nums text-foreground">
                            {remaining == null ? "No cap" : `${remaining.toLocaleString()} left`}
                        </p>
                        <p className="text-[10px] font-medium uppercase leading-4 tracking-[0.1em] text-muted-foreground/80">
                            {form.maxSubmissions == null
                                ? "Unlimited"
                                : `of ${form.maxSubmissions.toLocaleString()}`}
                        </p>
                    </div>

                    <div className="order-2 flex items-center justify-end lg:order-none lg:pt-0.5">
                        <div className="flex items-center gap-1">
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 rounded-md border-border/60 bg-background text-muted-foreground shadow-none transition-colors hover:border-foreground/40 hover:text-foreground"
                                asChild
                            >
                                <Link href={`/dashboard/form/${form.id}`} aria-label="Open submissions">
                                    <ArrowUpRight className="h-4 w-4" />
                                </Link>
                            </Button>

                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8 rounded-md border-border/60 bg-background text-muted-foreground shadow-none transition-colors hover:border-foreground/40 hover:text-foreground"
                                        aria-label="Form options"
                                    >
                                        <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem asChild>
                                        <Link href={`/dashboard/form/${form.id}/edit`}>
                                            <Pencil className="mr-2 h-4 w-4" />
                                            Edit
                                        </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={handleToggle} disabled={isPending}>
                                        <Power className="mr-2 h-4 w-4" />
                                        {form.disabledByUser ? "Enable" : "Pause"}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem asChild>
                                        <Link href={`/f/${form.id}`} target="_blank" rel="noopener noreferrer">
                                            <ExternalLink className="mr-2 h-4 w-4" />
                                            Open link
                                        </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        className="text-destructive focus:text-destructive"
                                        onClick={() => setShowDeleteDialog(true)}
                                    >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Delete
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                </div>
            </article>

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
                            and all {form.submissionsCount} of its submissions. This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
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

function CapabilityIcons({ form }: { form: FormListItemSerialized }) {
    if (!form.allowFileUploads && !form.notifyOnSubmission && !form.hideBranding) return null

    return (
        <>
            <span aria-hidden className="text-border">·</span>
            <span className="inline-flex items-center gap-1.5 text-muted-foreground/80">
                {form.allowFileUploads ? (
                    <span
                        className="inline-flex h-4 w-4 items-center justify-center"
                        title="File uploads enabled"
                    >
                        <Paperclip className="h-3 w-3" />
                        <span className="sr-only">File uploads enabled</span>
                    </span>
                ) : null}
                {form.notifyOnSubmission ? (
                    <span
                        className="inline-flex h-4 w-4 items-center justify-center"
                        title="Submission notifications enabled"
                    >
                        <Bell className="h-3 w-3" />
                        <span className="sr-only">Submission notifications enabled</span>
                    </span>
                ) : null}
                {form.hideBranding ? (
                    <span
                        className="inline-flex h-4 w-4 items-center justify-center"
                        title="Branding hidden"
                    >
                        <Sparkles className="h-3 w-3" />
                        <span className="sr-only">Branding hidden</span>
                    </span>
                ) : null}
            </span>
        </>
    )
}

function formatShortDate(value: string) {
    return DATE_FORMATTER.format(new Date(value))
}
