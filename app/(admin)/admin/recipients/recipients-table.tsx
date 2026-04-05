"use client"

import { DataTable, type Column } from "@/components/admin/data-table"
import { VerificationBadge } from "@/components/admin/verification-badge"
import { UserLink } from "@/components/admin/entity-link"
import { formatRelativeTime } from "@/lib/admin/format"
import { Key } from "lucide-react"

interface RecipientWithUser {
    id: string
    email: string
    verified: boolean
    pgpFingerprint: string | null
    createdAt: Date
    user: { id: string; email: string; name: string | null }
    _count: { aliases: number }
}

interface RecipientsTableProps {
    recipients: RecipientWithUser[]
    total: number
    page: number
    totalPages: number
    search: string
    filter: string
}

export function RecipientsTable({
    recipients,
    total,
    page,
    totalPages,
    search,
    filter
}: RecipientsTableProps) {
    const columns: Column<RecipientWithUser>[] = [
        {
            header: "Email",
            accessor: (row) => (
                <span className="font-mono text-sm">{row.email}</span>
            )
        },
        {
            header: "Status",
            accessor: (row) => <VerificationBadge verified={row.verified} size="sm" />
        },
        {
            header: "PGP",
            accessor: (row) => row.pgpFingerprint ? (
                <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                    <Key className="h-3 w-3" />
                    {row.pgpFingerprint.slice(-8)}
                </span>
            ) : (
                <span className="text-muted-foreground text-xs">None</span>
            )
        },
        {
            header: "Owner",
            accessor: (row) => <UserLink user={row.user} />
        },
        {
            header: "Aliases",
            accessor: (row) => row._count.aliases
        },
        {
            header: "Created",
            accessor: (row) => formatRelativeTime(row.createdAt)
        }
    ]

    const filterOptions = [
        { value: "all", label: "All Recipients" },
        { value: "verified", label: "Verified" },
        { value: "unverified", label: "Unverified" },
        { value: "pgp", label: "Has PGP Key" }
    ]

    return (
        <DataTable
            data={recipients}
            columns={columns}
            total={total}
            page={page}
            totalPages={totalPages}
            basePath="/admin/recipients"
            search={search}
            filter={filter}
            filterOptions={filterOptions}
            getRowHref={(row) => `/admin/recipients/${row.id}`}
            searchPlaceholder="Search recipients..."
            emptyMessage="No recipients found"
            rowKey={(row) => row.id}
        />
    )
}
