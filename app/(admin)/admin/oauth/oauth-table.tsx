"use client"

import { DataTable, type Column } from "@/components/admin/data-table"
import { UserLink } from "@/components/admin/entity-link"
import { StatusBadge } from "@/components/admin/status-badge"
import { formatRelativeTime } from "@/lib/format"
import { CheckCircle2, Ban } from "lucide-react"
import { OauthAppActions } from "./[appId]/oauth-app-actions"

interface OauthAppRow {
    id: string
    clientId: string
    name: string
    type: string
    disabled: boolean
    createdAt: Date
    user: { id: string; email: string; name: string | null } | null
    usage: { tokens: number; consents: number }
}

interface OauthAppsTableProps {
    apps: OauthAppRow[]
    total: number
    page: number
    totalPages: number
    search: string
    filter: string
}

export function OauthAppsTable({ apps, total, page, totalPages, search, filter }: OauthAppsTableProps) {
    const columns: Column<OauthAppRow>[] = [
        {
            header: "Application",
            accessor: (row) => (
                <div>
                    <div className="font-medium">{row.name}</div>
                    <code className="text-xs text-muted-foreground">{row.clientId}</code>
                </div>
            ),
        },
        { header: "Type", accessor: (row) => <span className="capitalize">{row.type}</span> },
        { header: "Owner", accessor: (row) => <UserLink user={row.user} /> },
        {
            header: "Status",
            accessor: (row) =>
                row.disabled ? (
                    <StatusBadge tone="danger" label="Disabled" icon={Ban} />
                ) : (
                    <StatusBadge tone="success" label="Active" icon={CheckCircle2} />
                ),
        },
        { header: "Tokens", accessor: (row) => row.usage.tokens },
        { header: "Consents", accessor: (row) => row.usage.consents },
        { header: "Created", accessor: (row) => formatRelativeTime(row.createdAt) },
    ]

    return (
        <DataTable
            data={apps}
            columns={columns}
            total={total}
            page={page}
            totalPages={totalPages}
            basePath="/admin/oauth"
            search={search}
            filter={filter}
            filterOptions={[
                { value: "all", label: "All Apps" },
                { value: "active", label: "Active" },
                { value: "disabled", label: "Disabled" },
            ]}
            searchPlaceholder="Search by name or client ID..."
            emptyMessage="No OAuth applications found"
            rowKey={(row) => row.id}
            getRowHref={(row) => `/admin/oauth/${row.id}`}
            rowActions={(row) => <OauthAppActions app={row} />}
        />
    )
}
