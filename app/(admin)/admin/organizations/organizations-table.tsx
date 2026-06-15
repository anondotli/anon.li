"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { DataTable, type Column } from "@/components/admin/data-table"
import { EntityLink } from "@/components/admin/entity-link"
import { formatRelativeTime } from "@/lib/format"

interface OrganizationRow {
    id: string
    name: string
    slug: string
    createdAt: Date
    memberCount: number
    seatLimit: number
    subscription: { seats: number; tier: string; status: string; product: string } | null
}

interface OrganizationStats {
    totalOrganizations: number
    totalMembers: number
    activeBusinessSubs: number
}

interface OrganizationsTableProps {
    organizations: OrganizationRow[]
    total: number
    page: number
    totalPages: number
    search: string
    stats: OrganizationStats
}

export function OrganizationsTable({
    organizations,
    total,
    page,
    totalPages,
    search,
    stats
}: OrganizationsTableProps) {
    const columns: Column<OrganizationRow>[] = [
        {
            header: "Organization",
            accessor: (row) => <EntityLink type="organization" id={row.id} label={row.name} />
        },
        {
            header: "Slug",
            accessor: (row) => <code className="text-xs text-muted-foreground">{row.slug}</code>
        },
        {
            header: "Members",
            accessor: (row) => (
                <span className={row.memberCount > row.seatLimit ? "text-destructive font-medium" : undefined}>
                    {row.memberCount} / {row.seatLimit}
                </span>
            )
        },
        {
            header: "Plan",
            accessor: (row) => row.subscription ? (
                <div className="flex flex-col gap-1">
                    <Badge variant="default" className="capitalize w-fit">
                        {row.subscription.product} {row.subscription.tier}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{row.subscription.status}</span>
                </div>
            ) : (
                <Badge variant="outline">Free</Badge>
            )
        },
        {
            header: "Created",
            accessor: (row) => formatRelativeTime(row.createdAt)
        }
    ]

    const statCards = [
        { label: "Organizations", value: stats.totalOrganizations },
        { label: "Total Members", value: stats.totalMembers },
        { label: "Active Business Subs", value: stats.activeBusinessSubs },
    ]

    return (
        <div className="space-y-8">
            <div className="grid gap-4 sm:grid-cols-3">
                {statCards.map((stat) => (
                    <Card key={stat.label}>
                        <CardHeader className="pb-2">
                            <CardDescription>{stat.label}</CardDescription>
                            <CardTitle className="text-3xl">{stat.value}</CardTitle>
                        </CardHeader>
                    </Card>
                ))}
            </div>

            <DataTable
                data={organizations}
                columns={columns}
                total={total}
                page={page}
                totalPages={totalPages}
                basePath="/admin/organizations"
                search={search}
                getRowHref={(row) => `/admin/organizations/${row.id}`}
                searchPlaceholder="Search by name or slug..."
                emptyMessage="No organizations found"
                rowKey={(row) => row.id}
            />
        </div>
    )
}

export function OrganizationsTableSkeleton() {
    return (
        <div className="space-y-8">
            <div className="grid gap-4 sm:grid-cols-3">
                {[0, 1, 2].map((i) => (
                    <Card key={i}>
                        <CardHeader className="pb-2">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-8 w-16" />
                        </CardHeader>
                    </Card>
                ))}
            </div>
            <div className="space-y-3">
                <Skeleton className="h-10 w-full max-w-sm" />
                <Skeleton className="h-64 w-full rounded-xl" />
            </div>
        </div>
    )
}
