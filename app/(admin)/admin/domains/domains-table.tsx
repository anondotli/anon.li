"use client"

import { DataTable, type Column } from "@/components/admin/data-table"
import { VerificationBadge, DomainVerificationStatus } from "@/components/admin/verification-badge"
import { UserLink } from "@/components/admin/entity-link"
import { formatRelativeTime } from "@/lib/admin/format"

interface DomainWithUser {
    id: string
    domain: string
    verified: boolean
    ownershipVerified: boolean
    mxVerified: boolean
    spfVerified: boolean
    dkimVerified: boolean
    catchAll: boolean
    scheduledForRemovalAt: Date | null
    createdAt: Date
    user: { id: string; email: string; name: string | null } | null
    aliasCount: number
}

interface DomainsTableProps {
    domains: DomainWithUser[]
    total: number
    page: number
    totalPages: number
    search: string
    filter: string
}

export function DomainsTable({
    domains,
    total,
    page,
    totalPages,
    search,
    filter
}: DomainsTableProps) {
    const columns: Column<DomainWithUser>[] = [
        {
            header: "Domain",
            accessor: (row) => (
                <span className="font-mono text-sm">{row.domain}</span>
            )
        },
        {
            header: "Status",
            accessor: (row) => (
                <div className="flex flex-wrap gap-1">
                    <VerificationBadge verified={row.verified} size="sm" />
                    {row.catchAll && <span className="text-xs rounded border px-2 py-0.5">Catch-all</span>}
                    {row.scheduledForRemovalAt && <span className="text-xs rounded border border-destructive text-destructive px-2 py-0.5">Scheduled</span>}
                </div>
            )
        },
        {
            header: "Verification",
            accessor: (row) => <DomainVerificationStatus domain={row} compact />
        },
        {
            header: "Owner",
            accessor: (row) => <UserLink user={row.user} />
        },
        {
            header: "Aliases",
            accessor: (row) => row.aliasCount
        },
        {
            header: "Created",
            accessor: (row) => formatRelativeTime(row.createdAt)
        }
    ]

    const filterOptions = [
        { value: "all", label: "All Domains" },
        { value: "verified", label: "Verified" },
        { value: "unverified", label: "Unverified" },
        { value: "catchall", label: "Catch-all" },
        { value: "scheduled", label: "Scheduled removal" }
    ]

    return (
        <DataTable
            data={domains}
            columns={columns}
            total={total}
            page={page}
            totalPages={totalPages}
            basePath="/admin/domains"
            search={search}
            filter={filter}
            filterOptions={filterOptions}
            getRowHref={(row) => `/admin/domains/${row.id}`}
            searchPlaceholder="Search domains..."
            emptyMessage="No domains found"
            rowKey={(row) => row.id}
        />
    )
}
