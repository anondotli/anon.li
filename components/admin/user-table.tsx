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
    banReason: string | null
    tosViolations: number
    stripePriceId: string | null
    storageUsed: string
    storageLimit: string
    createdAt: Date
    updatedAt: Date
    _count: {
        aliases: number
        drops: number
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
    { value: "admin", label: "Admins" }
]

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
                <Badge variant="outline">{getPlanName(user.stripePriceId)}</Badge>
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
