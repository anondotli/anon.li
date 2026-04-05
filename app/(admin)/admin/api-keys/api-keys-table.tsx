"use client"

import { DataTable, type Column } from "@/components/admin/data-table"
import { UserLink } from "@/components/admin/entity-link"
import { formatRelativeTime } from "@/lib/admin/format"
import { ApiKeyActions } from "./api-key-actions"

interface ApiKeyWithUser {
    id: string
    keyPrefix: string
    label: string | null
    createdAt: Date
    user: { id: string; email: string; name: string | null }
}

interface ApiKeysTableProps {
    apiKeys: ApiKeyWithUser[]
    total: number
    page: number
    totalPages: number
    search: string
}

export function ApiKeysTable({
    apiKeys,
    total,
    page,
    totalPages,
    search
}: ApiKeysTableProps) {
    const columns: Column<ApiKeyWithUser>[] = [
        {
            header: "Key Prefix",
            accessor: (row) => (
                <code className="text-sm bg-muted px-2 py-1 rounded">
                    {row.keyPrefix}...
                </code>
            )
        },
        {
            header: "Label",
            accessor: (row) => row.label || <span className="text-muted-foreground">-</span>
        },
        {
            header: "Owner",
            accessor: (row) => <UserLink user={row.user} />
        },
        {
            header: "Created",
            accessor: (row) => formatRelativeTime(row.createdAt)
        },
        {
            header: "Actions",
            accessor: (row) => <ApiKeyActions apiKey={row} />,
            className: "w-24"
        }
    ]

    return (
        <DataTable
            data={apiKeys}
            columns={columns}
            total={total}
            page={page}
            totalPages={totalPages}
            basePath="/admin/api-keys"
            search={search}
            searchPlaceholder="Search by prefix or label..."
            emptyMessage="No API keys found"
            rowKey={(row) => row.id}
        />
    )
}
