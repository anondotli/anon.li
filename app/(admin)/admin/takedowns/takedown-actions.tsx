"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/admin/confirm-dialog"
import { RotateCcw, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { restoreDrop, hardDeleteDrop } from "@/actions/admin"

interface Drop {
    id: string
}

export function TakedownActions({ drop }: { drop: Drop }) {
    const router = useRouter()
    const [showRestoreDialog, setShowRestoreDialog] = useState(false)
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const [loading, setLoading] = useState(false)

    const handleRestore = async () => {
        setLoading(true)
        try {
            const result = await restoreDrop(drop.id)

            if (result.error) {
                throw new Error(result.error)
            }

            toast.success("Drop restored successfully")
            router.refresh()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to restore drop")
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async () => {
        setLoading(true)
        try {
            const result = await hardDeleteDrop(drop.id)

            if (result.error) {
                throw new Error(result.error)
            }

            toast.success("Drop permanently deleted")
            router.refresh()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to delete drop")
        } finally {
            setLoading(false)
        }
    }

    return (
        <>
            <div className="flex gap-1">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                        e.stopPropagation()
                        setShowRestoreDialog(true)
                    }}
                    title="Restore"
                >
                    <RotateCcw className="h-4 w-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={(e) => {
                        e.stopPropagation()
                        setShowDeleteDialog(true)
                    }}
                    title="Delete permanently"
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>

            <ConfirmDialog
                open={showRestoreDialog}
                onOpenChange={setShowRestoreDialog}
                title="Restore Drop"
                description="This will restore the drop and make it accessible again. The user will regain access to their content."
                confirmLabel="Restore"
                variant="default"
                onConfirm={handleRestore}
                loading={loading}
            />

            <ConfirmDialog
                open={showDeleteDialog}
                onOpenChange={setShowDeleteDialog}
                title="Permanently Delete Drop"
                description="This will permanently delete the drop and all its files. This action cannot be undone."
                confirmLabel="Delete Forever"
                onConfirm={handleDelete}
                loading={loading}
            />
        </>
    )
}
