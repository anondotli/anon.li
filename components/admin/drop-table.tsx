"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { DataTable, Column } from "./data-table"
import { formatDate, formatBytes } from "@/lib/admin/format"

interface Drop {
    id: string
    uploadComplete: boolean
    disabled: boolean
    takenDown: boolean
    takedownReason: string | null
    downloads: number
    maxDownloads: number | null
    customKey: boolean
    viewedAt: Date | null
    expiresAt: Date | null
    createdAt: Date
    user: { id: string; email: string } | null
    ownerKey: { id: string; vaultGeneration: number; createdAt: Date } | null
    totalSize: number
    fileCount: number
}

interface DropTableProps {
    drops: Drop[]
    total: number
    page: number
    totalPages: number
    search: string
    filter: string
}

const filterOptions = [
    { value: "all", label: "All Drops" },
    { value: "active", label: "Active" },
    { value: "disabled", label: "Disabled" },
    { value: "takendown", label: "Taken Down" },
    { value: "anonymous", label: "Anonymous" },
    { value: "incomplete", label: "Incomplete" }
]

export function DropTable({ drops, total, page, totalPages, search, filter }: DropTableProps) {
    const columns: Column<Drop>[] = [
        {
            header: "Drop ID",
            accessor: (drop) => (
                <code className="text-sm">{drop.id.slice(0, 16)}...</code>
            )
        },
        {
            header: "Owner",
            accessor: (drop) => drop.user ? (
                <Link
                    href={`/admin/users/${drop.user.id}`}
                    className="text-sm hover:underline"
                    onClick={(e) => e.stopPropagation()}
                >
                    {drop.user.email}
                </Link>
            ) : (
                <span className="text-sm text-muted-foreground">Anonymous</span>
            )
        },
        {
            header: "Status",
            accessor: (drop) => (
                <div className="flex flex-wrap gap-1">
                    {drop.takenDown ? (
                        <Badge variant="destructive">Taken Down</Badge>
                    ) : drop.disabled ? (
                        <Badge variant="outline">Disabled</Badge>
                    ) : (
                        <Badge variant="secondary">Active</Badge>
                    )}
                    {!drop.uploadComplete && (
                        <Badge variant="outline">Incomplete</Badge>
                    )}
                    {drop.customKey && (
                        <Badge variant="outline">Password</Badge>
                    )}
                    {drop.ownerKey && (
                        <Badge variant="outline">Vault key</Badge>
                    )}
                </div>
            )
        },
        {
            header: "Files",
            accessor: (drop) => (
                <div className="text-sm">
                    {drop.fileCount} file{drop.fileCount !== 1 ? "s" : ""}
                    <span className="text-muted-foreground ml-1">
                        ({formatBytes(drop.totalSize)})
                    </span>
                </div>
            )
        },
        {
            header: "Downloads",
            accessor: (drop) => (
                <div className="text-sm">
                    {drop.downloads}
                    {drop.maxDownloads && (
                        <span className="text-muted-foreground"> / {drop.maxDownloads}</span>
                    )}
                </div>
            )
        },
        {
            header: "Created",
            accessor: (drop) => (
                <div className="text-sm text-muted-foreground">
                    {formatDate(drop.createdAt)}
                </div>
            )
        }
    ]

    return (
        <DataTable
            data={drops}
            columns={columns}
            total={total}
            page={page}
            totalPages={totalPages}
            basePath="/admin/drops"
            search={search}
            filter={filter}
            filterOptions={filterOptions}
            searchPlaceholder="Search by drop ID or user email..."
            emptyMessage="No drops found"
            rowKey={(drop) => drop.id}
            getRowHref={(drop) => `/admin/drops/${drop.id}`}
        />
    )
}
