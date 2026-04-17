"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { DataTable, Column } from "./data-table"
import { formatDate } from "@/lib/admin/format"
import { deleteAlias } from "@/actions/admin"
import { toast } from "sonner"
import { Trash2 } from "lucide-react"

interface Alias {
    id: string
    email: string
    active: boolean
    emailsReceived: number
    emailsBlocked: number
    lastEmailAt: Date | null
    scheduledForRemovalAt: Date | null
    createdAt: Date
    user: { id: string; email: string }
    recipients: Array<{
        id: string
        email: string
        verified: boolean
        isPrimary: boolean
        source: "routing" | "legacy"
    }>
}

interface AliasTableProps {
    aliases: Alias[]
    total: number
    page: number
    totalPages: number
    search: string
    filter: string
}

const filterOptions = [
    { value: "all", label: "All Aliases" },
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
    { value: "scheduled", label: "Scheduled removal" }
]

export function AliasTable({ aliases, total, page, totalPages, search, filter }: AliasTableProps) {
    const router = useRouter()
    const [deleteId, setDeleteId] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    const handleDelete = async () => {
        if (!deleteId) return

        setLoading(true)
        const result = await deleteAlias(deleteId)

        if (result.success) {
            toast.success("Alias deleted successfully")
            router.refresh()
            setDeleteId(null)
        } else if (result.error) {
            toast.error(result.error)
        }
        setLoading(false)
    }

    const columns: Column<Alias>[] = [
        {
            header: "Alias",
            accessor: (alias) => (
                <code className="text-sm">{alias.email}</code>
            )
        },
        {
            header: "Owner",
            accessor: (alias) => (
                <Link
                    href={`/admin/users/${alias.user.id}`}
                    className="text-sm hover:underline"
                    onClick={(e) => e.stopPropagation()}
                >
                    {alias.user.email}
                </Link>
            )
        },
        {
            header: "Recipients",
            accessor: (alias) => (
                <div className="text-sm">
                    {alias.recipients.length > 0 ? (
                        <>
                            <span className="font-mono">{alias.recipients[0]?.email}</span>
                            {alias.recipients.length > 1 && (
                                <span className="text-muted-foreground ml-1">
                                    +{alias.recipients.length - 1}
                                </span>
                            )}
                            {alias.recipients.some((recipient) => recipient.source === "legacy") && (
                                <Badge variant="outline" className="ml-2 text-xs">Legacy</Badge>
                            )}
                        </>
                    ) : (
                        <span className="text-muted-foreground">No recipient</span>
                    )}
                </div>
            )
        },
        {
            header: "Status",
            accessor: (alias) => (
                <div className="flex flex-wrap gap-1">
                    <Badge variant={alias.active ? "secondary" : "outline"}>
                        {alias.active ? "Active" : "Inactive"}
                    </Badge>
                    {alias.scheduledForRemovalAt && (
                        <Badge variant="destructive">Scheduled</Badge>
                    )}
                </div>
            )
        },
        {
            header: "Emails",
            accessor: (alias) => (
                <div className="text-sm">
                    {alias.emailsReceived} received
                    {alias.emailsBlocked > 0 && (
                        <span className="text-muted-foreground ml-1">
                            · {alias.emailsBlocked} blocked
                        </span>
                    )}
                </div>
            )
        },
        {
            header: "Last Email",
            accessor: (alias) => (
                <div className="text-sm text-muted-foreground">
                    {alias.lastEmailAt ? formatDate(alias.lastEmailAt) : "Never"}
                </div>
            )
        },
        {
            header: "Created",
            accessor: (alias) => (
                <div className="text-sm text-muted-foreground">
                    {formatDate(alias.createdAt)}
                </div>
            )
        },
        {
            header: "",
            accessor: (alias) => (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                        e.stopPropagation()
                        setDeleteId(alias.id)
                    }}
                    title="Delete alias"
                >
                    <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                </Button>
            )
        }
    ]

    return (
        <>
            <DataTable
                data={aliases}
                columns={columns}
                total={total}
                page={page}
                totalPages={totalPages}
                basePath="/admin/aliases"
                search={search}
                filter={filter}
                filterOptions={filterOptions}
                searchPlaceholder="Search by alias or user email..."
                emptyMessage="No aliases found"
                rowKey={(alias) => alias.id}
                getRowHref={(alias) => `/admin/aliases/${alias.id}`}
            />

            <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Alias</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete this alias. Emails sent to this address will no longer be forwarded. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={loading}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {loading ? "Deleting..." : "Delete Alias"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
