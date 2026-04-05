"use client"

import { DataTable, type Column } from "@/components/admin/data-table"
import { UserLink } from "@/components/admin/entity-link"
import { formatRelativeTime } from "@/lib/admin/format"
import { TakedownActions } from "./takedown-actions"

interface TakedownDrop {
    id: string
    takedownReason: string | null
    takenDownAt: Date | null
    createdAt: Date
    user: { id: string; email: string; name: string | null } | null
    _count: { files: number }
}

interface TakedownsTableProps {
    drops: TakedownDrop[]
    total: number
    page: number
    totalPages: number
    search: string
}

export function TakedownsTable({
    drops,
    total,
    page,
    totalPages,
    search
}: TakedownsTableProps) {
    const columns: Column<TakedownDrop>[] = [
        {
            header: "Drop ID",
            accessor: (row) => (
                <code className="text-sm bg-muted px-2 py-1 rounded">
                    {row.id.slice(0, 12)}...
                </code>
            )
        },
        {
            header: "Reason",
            accessor: (row) => (
                <span className="text-sm">
                    {row.takedownReason || <span className="text-muted-foreground">No reason</span>}
                </span>
            )
        },
        {
            header: "Files",
            accessor: (row) => row._count.files
        },
        {
            header: "Owner",
            accessor: (row) => <UserLink user={row.user} />
        },
        {
            header: "Taken Down",
            accessor: (row) => row.takenDownAt ? (
                formatRelativeTime(row.takenDownAt)
            ) : "-"
        },
        {
            header: "Actions",
            accessor: (row) => <TakedownActions drop={row} />,
            className: "w-32"
        }
    ]

    return (
        <DataTable
            data={drops}
            columns={columns}
            total={total}
            page={page}
            totalPages={totalPages}
            basePath="/admin/takedowns"
            search={search}
            searchPlaceholder="Search by ID or reason..."
            emptyMessage="No takedowns found"
            rowKey={(row) => row.id}
        />
    )
}
