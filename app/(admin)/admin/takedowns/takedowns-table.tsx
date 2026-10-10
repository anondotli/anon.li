"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { DataTable, type Column } from "@/components/admin/data-table"
import { UserLink } from "@/components/admin/entity-link"
import { formatRelativeTime } from "@/lib/format"
import type { AdminTakedownRow } from "@/lib/data/admin"
import { TakedownActions } from "./takedown-actions"

interface TakedownsTableProps {
    takedowns: AdminTakedownRow[]
    total: number
    page: number
    totalPages: number
    search: string
    type: string
}

const TYPE_PATHS: Record<AdminTakedownRow["type"], string> = {
    drop: "/admin/drops",
    form: "/admin/forms",
    alias: "/admin/aliases",
}

const filterOptions = [
    { value: "all", label: "All types" },
    { value: "drop", label: "Drops" },
    { value: "form", label: "Forms" },
    { value: "alias", label: "Aliases" },
]

export function TakedownsTable({
    takedowns,
    total,
    page,
    totalPages,
    search,
    type
}: TakedownsTableProps) {
    const columns: Column<AdminTakedownRow>[] = [
        {
            header: "Type",
            accessor: (row) => <Badge variant="outline" className="capitalize">{row.type}</Badge>
        },
        {
            header: "Resource",
            accessor: (row) => (
                <Link
                    href={`${TYPE_PATHS[row.type]}/${row.id}`}
                    className="text-sm font-mono hover:underline"
                >
                    {row.type === "drop" ? `${row.label.slice(0, 12)}...` : row.label}
                </Link>
            )
        },
        {
            header: "Reason",
            accessor: (row) => (
                <span className="text-sm">
                    {row.reason || <span className="text-muted-foreground">No reason</span>}
                </span>
            )
        },
        {
            header: "Details",
            accessor: (row) => <span className="text-sm text-muted-foreground">{row.detail}</span>
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
            accessor: (row) => <TakedownActions item={row} />,
            className: "w-32"
        }
    ]

    return (
        <DataTable
            data={takedowns}
            columns={columns}
            total={total}
            page={page}
            totalPages={totalPages}
            basePath="/admin/takedowns"
            search={search}
            filter={type}
            filterKey="type"
            filterOptions={filterOptions}
            searchPlaceholder="Search by ID, title, alias, reason, or owner..."
            emptyMessage="No takedowns found"
            rowKey={(row) => `${row.type}:${row.id}`}
        />
    )
}
