"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { DataTable, Column } from "./data-table"
import { formatDate } from "@/lib/admin/format"

interface Form {
    id: string
    title: string
    active: boolean
    disabledByUser: boolean
    takenDown: boolean
    takedownReason: string | null
    customKey: boolean
    allowFileUploads: boolean
    submissionsCount: number
    maxSubmissions: number | null
    closesAt: Date | null
    createdAt: Date
    user: { id: string; email: string }
    _count: { submissions: number }
}

interface FormTableProps {
    forms: Form[]
    total: number
    page: number
    totalPages: number
    search: string
    filter: string
}

const filterOptions = [
    { value: "all", label: "All Forms" },
    { value: "active", label: "Active" },
    { value: "disabled", label: "Disabled" },
    { value: "takendown", label: "Taken Down" },
    { value: "closed", label: "Closed" },
]

export function FormTable({ forms, total, page, totalPages, search, filter }: FormTableProps) {
    const columns: Column<Form>[] = [
        {
            header: "Form",
            accessor: (form) => (
                <div>
                    <p className="text-sm font-medium truncate max-w-[260px]">{form.title || "(untitled)"}</p>
                    <code className="text-xs text-muted-foreground">{form.id}</code>
                </div>
            ),
        },
        {
            header: "Owner",
            accessor: (form) => (
                <Link
                    href={`/admin/users/${form.user.id}`}
                    className="text-sm hover:underline"
                    onClick={(e) => e.stopPropagation()}
                >
                    {form.user.email}
                </Link>
            ),
        },
        {
            header: "Status",
            accessor: (form) => (
                <div className="flex flex-wrap gap-1">
                    {form.takenDown ? (
                        <Badge variant="destructive">Taken Down</Badge>
                    ) : form.disabledByUser ? (
                        <Badge variant="outline">Disabled</Badge>
                    ) : (
                        <Badge variant="secondary">Active</Badge>
                    )}
                    {form.customKey && <Badge variant="outline">Password</Badge>}
                    {form.allowFileUploads && <Badge variant="outline">Files</Badge>}
                </div>
            ),
        },
        {
            header: "Submissions",
            accessor: (form) => (
                <div className="text-sm">
                    {form._count.submissions}
                    {form.maxSubmissions && (
                        <span className="text-muted-foreground"> / {form.maxSubmissions}</span>
                    )}
                </div>
            ),
        },
        {
            header: "Closes",
            accessor: (form) => (
                <div className="text-sm text-muted-foreground">
                    {form.closesAt ? formatDate(form.closesAt) : "Never"}
                </div>
            ),
        },
        {
            header: "Created",
            accessor: (form) => (
                <div className="text-sm text-muted-foreground">
                    {formatDate(form.createdAt)}
                </div>
            ),
        },
    ]

    return (
        <DataTable
            data={forms}
            columns={columns}
            total={total}
            page={page}
            totalPages={totalPages}
            basePath="/admin/forms"
            search={search}
            filter={filter}
            filterOptions={filterOptions}
            searchPlaceholder="Search by form ID, title, or user email..."
            emptyMessage="No forms found"
            rowKey={(form) => form.id}
            getRowHref={(form) => `/admin/forms/${form.id}`}
        />
    )
}
