"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { HardDrive, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DataTable, type Column } from "@/components/admin/data-table"
import { ConfirmDialog } from "@/components/admin/confirm-dialog"
import { formatRelativeTime } from "@/lib/admin/format"
import { cleanupOrphanedFiles } from "@/actions/admin"

interface OrphanedFileRow {
    id: string
    createdAt: Date
}

interface StorageTableProps {
    orphanedFiles: OrphanedFileRow[]
    oldestCreatedAt: Date | null
    total: number
    page: number
    totalPages: number
}

export function StorageTable({ orphanedFiles, oldestCreatedAt, total, page, totalPages }: StorageTableProps) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)

    const handleCleanup = async () => {
        setLoading(true)
        const result = await cleanupOrphanedFiles()

        if (result.success) {
            const deleted = result.data?.deleted ?? 0
            const errors = result.data?.errors.length ?? 0
            toast.success(`Cleanup finished: ${deleted} deleted${errors ? `, ${errors} errors` : ""}`)
            setOpen(false)
            router.refresh()
        } else {
            toast.error(result.error ?? "Cleanup failed")
        }
        setLoading(false)
    }

    const columns: Column<OrphanedFileRow>[] = [
        {
            header: "Record ID",
            accessor: (row) => <code className="text-xs">{row.id}</code>
        },
        {
            header: "Created",
            accessor: (row) => formatRelativeTime(row.createdAt)
        }
    ]

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Orphaned Files</CardTitle>
                        <HardDrive className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{total}</div>
                        <p className="text-xs text-muted-foreground">
                            {oldestCreatedAt ? `Oldest ${formatRelativeTime(oldestCreatedAt)}` : "No cleanup backlog"}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Manual Cleanup</CardTitle>
                        <RotateCcw className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <Button onClick={() => setOpen(true)} disabled={total === 0}>
                            <RotateCcw className="h-4 w-4" />
                            Retry Cleanup
                        </Button>
                    </CardContent>
                </Card>
            </div>

            <DataTable
                data={orphanedFiles}
                columns={columns}
                total={total}
                page={page}
                totalPages={totalPages}
                basePath="/admin/storage"
                searchPlaceholder="Search is disabled for hidden storage keys"
                emptyMessage="No orphaned files found"
                rowKey={(row) => row.id}
            />

            <ConfirmDialog
                open={open}
                onOpenChange={setOpen}
                title="Retry Orphaned File Cleanup"
                description="This runs the existing storage cleanup pipeline and removes database records only for objects deleted successfully."
                confirmLabel="Retry Cleanup"
                variant="default"
                onConfirm={handleCleanup}
                loading={loading}
            />
        </div>
    )
}
