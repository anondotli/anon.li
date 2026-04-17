"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { DataTable, type Column } from "@/components/admin/data-table"
import { formatRelativeTime } from "@/lib/admin/format"

interface AuditLogRow {
    id: string
    action: string
    actorId: string
    targetId: string | null
    metadata: string | null
    ip: string | null
    createdAt: Date
    actor: { id: string; email: string; name: string | null } | null
}

interface AuditTableProps {
    logs: AuditLogRow[]
    actions: string[]
    total: number
    page: number
    totalPages: number
    search: string
    action: string
}

function targetHref(action: string, targetId: string | null) {
    if (!targetId) return null
    if (action.startsWith("user.")) return `/admin/users/${targetId}`
    if (action.startsWith("drop.")) return `/admin/drops/${targetId}`
    if (action.startsWith("alias.")) return `/admin/aliases/${targetId}`
    if (action.startsWith("domain.")) return `/admin/domains/${targetId}`
    if (action.startsWith("recipient.")) return `/admin/recipients/${targetId}`
    if (action.startsWith("report.")) return `/admin/reports/${targetId}`
    return null
}

function shortMetadata(metadata: string | null) {
    if (!metadata) return "-"
    return metadata.length > 96 ? `${metadata.slice(0, 96)}...` : metadata
}

export function AuditTable({ logs, actions, total, page, totalPages, search, action }: AuditTableProps) {
    const columns: Column<AuditLogRow>[] = [
        {
            header: "Action",
            accessor: (row) => <Badge variant="outline">{row.action}</Badge>
        },
        {
            header: "Actor",
            accessor: (row) => row.actor ? (
                <Link
                    href={`/admin/users/${row.actor.id}`}
                    className="text-sm hover:underline"
                    onClick={(event) => event.stopPropagation()}
                >
                    {row.actor.email}
                </Link>
            ) : (
                <code className="text-xs text-muted-foreground">{row.actorId}</code>
            )
        },
        {
            header: "Target",
            accessor: (row) => {
                const href = targetHref(row.action, row.targetId)
                if (!row.targetId) return <span className="text-muted-foreground">-</span>
                return href ? (
                    <Link
                        href={href}
                        className="font-mono text-xs hover:underline"
                        onClick={(event) => event.stopPropagation()}
                    >
                        {row.targetId}
                    </Link>
                ) : (
                    <code className="text-xs">{row.targetId}</code>
                )
            }
        },
        {
            header: "Metadata",
            accessor: (row) => <code className="text-xs text-muted-foreground">{shortMetadata(row.metadata)}</code>
        },
        {
            header: "IP",
            accessor: (row) => row.ip ? <code className="text-xs">{row.ip}</code> : <span className="text-muted-foreground">-</span>
        },
        {
            header: "Created",
            accessor: (row) => formatRelativeTime(row.createdAt)
        }
    ]

    return (
        <DataTable
            data={logs}
            columns={columns}
            total={total}
            page={page}
            totalPages={totalPages}
            basePath="/admin/audit"
            search={search}
            filter={action}
            filterKey="action"
            filterOptions={[
                { value: "all", label: "All actions" },
                ...actions.map((value) => ({ value, label: value })),
            ]}
            searchPlaceholder="Search action, actor, target, or metadata..."
            emptyMessage="No audit logs found"
            rowKey={(row) => row.id}
        />
    )
}
