"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DataTable, type Column } from "@/components/admin/data-table"
import { ConfirmDialog } from "@/components/admin/confirm-dialog"
import { UserLink } from "@/components/admin/entity-link"
import { formatDateTime, formatRelativeTime } from "@/lib/admin/format"
import { processDeletionRequest } from "@/actions/admin"
import { toast } from "sonner"
import { RotateCcw } from "lucide-react"

interface DeletionRequestRow {
    id: string
    userId: string
    status: string
    sessionsDeleted: boolean
    aliasesDeleted: boolean
    domainsDeleted: boolean
    dropsDeleted: boolean
    storageDeleted: boolean
    failedStorageKeys: string | null
    failedStorageKeyCount: number | null
    requestedAt: Date
    completedAt: Date | null
    user: { id: string; email: string; name: string | null; isAdmin: boolean }
}

interface DeletionTableProps {
    requests: DeletionRequestRow[]
    total: number
    page: number
    totalPages: number
    search: string
    status: string
}

type DialogState =
    | { type: "process"; request: DeletionRequestRow }
    | null

function progressText(request: DeletionRequestRow) {
    const complete = [
        request.sessionsDeleted,
        request.aliasesDeleted,
        request.domainsDeleted,
        request.dropsDeleted,
        request.storageDeleted,
    ].filter(Boolean).length
    return `${complete}/5`
}

export function DeletionTable({ requests, total, page, totalPages, search, status }: DeletionTableProps) {
    const router = useRouter()
    const [dialog, setDialog] = useState<DialogState>(null)
    const [loading, setLoading] = useState(false)

    const runAction = async () => {
        if (!dialog) return

        setLoading(true)
        const result = await processDeletionRequest(dialog.request.id)

        if (result.success) {
            toast.success("Deletion request retried")
            setDialog(null)
            router.refresh()
        } else {
            toast.error(result.error ?? "Operation failed")
        }
        setLoading(false)
    }

    const columns: Column<DeletionRequestRow>[] = [
        {
            header: "User",
            accessor: (row) => <UserLink user={row.user} />
        },
        {
            header: "Status",
            accessor: (row) => (
                <div className="flex flex-wrap gap-1">
                    <Badge variant={row.status === "active_systems_deleted" ? "destructive" : "outline"}>{row.status}</Badge>
                    {row.failedStorageKeyCount ? <Badge variant="destructive">{row.failedStorageKeyCount} storage failures</Badge> : null}
                </div>
            )
        },
        {
            header: "Progress",
            accessor: (row) => (
                <span className="text-sm">
                    {progressText(row)}
                    <span className="text-muted-foreground"> active-system steps</span>
                </span>
            )
        },
        {
            header: "Requested",
            accessor: (row) => (
                <div>
                    <div>{formatRelativeTime(row.requestedAt)}</div>
                    <div className="text-xs text-muted-foreground">{formatDateTime(row.requestedAt)}</div>
                </div>
            )
        },
        {
            header: "Actions",
            accessor: (row) => (
                <div className="flex gap-2" onClick={(event) => event.stopPropagation()}>
                    <Button variant="outline" size="sm" onClick={() => setDialog({ type: "process", request: row })}>
                        <RotateCcw className="h-4 w-4" />
                        Retry
                    </Button>
                </div>
            ),
            className: "w-28"
        }
    ]

    return (
        <>
            <DataTable
                data={requests}
                columns={columns}
                total={total}
                page={page}
                totalPages={totalPages}
                basePath="/admin/deletion"
                search={search}
                filter={status}
                filterKey="status"
                filterOptions={[
                    { value: "all", label: "All requests" },
                    { value: "pending", label: "Pending" },
                    { value: "active_systems_deleted", label: "Active systems deleted" },
                ]}
                searchPlaceholder="Search user or request ID..."
                emptyMessage="No deletion requests found"
                rowKey={(row) => row.id}
                getRowHref={(row) => `/admin/users/${row.userId}`}
            />

            <ConfirmDialog
                open={!!dialog}
                onOpenChange={(open) => !open && setDialog(null)}
                title="Retry Deletion"
                description="This retries active-system erasure and immediately hard-deletes the user row if the retry succeeds."
                confirmLabel="Retry"
                variant="destructive"
                onConfirm={runAction}
                loading={loading}
            />
        </>
    )
}
