"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { DataTable, type Column } from "@/components/admin/data-table"
import { UserLink } from "@/components/admin/entity-link"
import { formatDateTime, formatRelativeTime } from "@/lib/format"

interface ReferralRow {
    id: string
    email: string
    name: string | null
    referralClaimedAt: Date | null
    referralPlusUntil: Date | null
    createdAt: Date
    referredBy: { id: string; email: string; name: string | null } | null
}

interface ReferralStats {
    totalReferrals: number
    totalReferrers: number
    activePlus: number
}

interface ReferralsTableProps {
    referrals: ReferralRow[]
    total: number
    page: number
    totalPages: number
    search: string
    stats: ReferralStats
}

export function ReferralsTable({
    referrals,
    total,
    page,
    totalPages,
    search,
    stats
}: ReferralsTableProps) {
    const columns: Column<ReferralRow>[] = [
        {
            header: "Referred User",
            accessor: (row) => <UserLink user={{ id: row.id, email: row.email, name: row.name }} />
        },
        {
            header: "Referred By",
            accessor: (row) => <UserLink user={row.referredBy} />
        },
        {
            header: "Plus Status",
            accessor: (row) => {
                const active = row.referralPlusUntil ? row.referralPlusUntil.getTime() > Date.now() : false
                if (!row.referralPlusUntil) {
                    return <span className="text-muted-foreground">—</span>
                }
                return (
                    <div className="flex flex-col gap-1">
                        <Badge variant={active ? "default" : "outline"}>{active ? "Active" : "Expired"}</Badge>
                        <span className="text-xs text-muted-foreground">until {formatDateTime(row.referralPlusUntil)}</span>
                    </div>
                )
            }
        },
        {
            header: "Claimed",
            accessor: (row) => row.referralClaimedAt
                ? formatRelativeTime(row.referralClaimedAt)
                : <span className="text-muted-foreground">—</span>
        }
    ]

    const statCards = [
        { label: "Successful Referrals", value: stats.totalReferrals },
        { label: "Referrers", value: stats.totalReferrers },
        { label: "Active Referral Plus", value: stats.activePlus },
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
                data={referrals}
                columns={columns}
                total={total}
                page={page}
                totalPages={totalPages}
                basePath="/admin/referrals"
                search={search}
                searchPlaceholder="Search referred user or referrer email..."
                emptyMessage="No referrals found"
                rowKey={(row) => row.id}
            />
        </div>
    )
}

export function ReferralsTableSkeleton() {
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
