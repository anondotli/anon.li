"use client"

import { Badge } from "@/components/ui/badge"
import { DataTable, Column } from "./data-table"
import { formatDate, formatBytes, getPlanName } from "@/lib/admin/format"

interface User {
    id: string
    email: string
    name: string | null
    isAdmin: boolean
    banned: boolean
    banAliasCreation: boolean
    banFileUpload: boolean
    banReason: string | null
    tosViolations: number
    stripePriceId: string | null
    paymentMethod: string
    twoFactorEnabled: boolean
    storageUsed: string
    storageLimit: string
    createdAt: Date
    updatedAt: Date
    primarySubscription: {
        provider: string
        product: string
        tier: string
        status: string
        currentPeriodEnd: Date | null
        cancelAtPeriodEnd: boolean
    } | null
    deletionRequest: {
        id: string
        status: string
        requestedAt: Date
        completedAt: Date | null
    } | null
    security: {
        migrationState: string
        vaultGeneration: number
        passwordSetAt: Date
    } | null
    _count: {
        aliases: number
        drops: number
        recipients: number
        domains: number
        apiKeys: number
    }
}

interface UserTableProps {
    users: User[]
    total: number
    page: number
    totalPages: number
    search: string
    filter: string
}

const filterOptions = [
    { value: "all", label: "All Users" },
    { value: "active", label: "Active" },
    { value: "banned", label: "Banned" },
    { value: "admin", label: "Admins" },
    { value: "deleting", label: "Deleting" }
]

function getSubscriptionLabel(user: User) {
    if (user.primarySubscription) {
        const product = user.primarySubscription.product.charAt(0).toUpperCase() + user.primarySubscription.product.slice(1)
        const tier = user.primarySubscription.tier.charAt(0).toUpperCase() + user.primarySubscription.tier.slice(1)
        return `${product} ${tier}`
    }

    return getPlanName(user.stripePriceId)
}

export function UserTable({ users, total, page, totalPages, search, filter }: UserTableProps) {
    const columns: Column<User>[] = [
        {
            header: "User",
            accessor: (user) => (
                <div>
                    <div className="font-medium">{user.email}</div>
                    <div className="text-sm text-muted-foreground">
                        {user.name || "No name"} · {user.id.slice(0, 8)}...
                    </div>
                </div>
            )
        },
        {
            header: "Status",
            accessor: (user) => (
                <div className="flex flex-wrap gap-1">
                    {user.isAdmin && <Badge variant="default">Admin</Badge>}
                    {user.banned ? (
                        <Badge variant="destructive">Banned</Badge>
                    ) : (
                        <Badge variant="secondary">Active</Badge>
                    )}
                    {user.banAliasCreation && <Badge variant="outline">Alias ban</Badge>}
                    {user.banFileUpload && <Badge variant="outline">Upload ban</Badge>}
                    {user.deletionRequest && <Badge variant="destructive">Deleting</Badge>}
                    {user.twoFactorEnabled && <Badge variant="outline">2FA</Badge>}
                    {user.tosViolations > 0 && (
                        <Badge variant="outline" className="text-orange-500 border-orange-500">
                            {user.tosViolations} strike{user.tosViolations !== 1 ? "s" : ""}
                        </Badge>
                    )}
                </div>
            )
        },
        {
            header: "Plan",
            accessor: (user) => (
                <div className="flex flex-col gap-1">
                    <Badge variant="outline">{getSubscriptionLabel(user)}</Badge>
                    <span className="text-xs text-muted-foreground capitalize">
                        {user.primarySubscription?.provider ?? user.paymentMethod}
                        {user.primarySubscription?.status ? ` · ${user.primarySubscription.status}` : ""}
                    </span>
                </div>
            )
        },
        {
            header: "Storage",
            accessor: (user) => (
                <div className="text-sm">
                    {formatBytes(user.storageUsed)} / {formatBytes(user.storageLimit)}
                </div>
            )
        },
        {
            header: "Resources",
            accessor: (user) => (
                <div className="text-sm text-muted-foreground">
                    {user._count.aliases} aliases · {user._count.drops} drops
                </div>
            )
        },
        {
            header: "Vault",
            accessor: (user) => (
                <div className="text-sm">
                    {user.security ? (
                        <>
                            <span className="capitalize">{user.security.migrationState}</span>
                            <span className="text-muted-foreground"> · gen {user.security.vaultGeneration}</span>
                        </>
                    ) : (
                        <span className="text-muted-foreground">Not set</span>
                    )}
                </div>
            )
        },
        {
            header: "Joined",
            accessor: (user) => (
                <div className="text-sm text-muted-foreground">
                    {formatDate(user.createdAt)}
                </div>
            )
        }
    ]

    return (
        <DataTable
            data={users}
            columns={columns}
            total={total}
            page={page}
            totalPages={totalPages}
            basePath="/admin/users"
            search={search}
            filter={filter}
            filterOptions={filterOptions}
            searchPlaceholder="Search by email, name, or ID..."
            emptyMessage="No users found"
            rowKey={(user) => user.id}
            getRowHref={(user) => `/admin/users/${user.id}`}
        />
    )
}
