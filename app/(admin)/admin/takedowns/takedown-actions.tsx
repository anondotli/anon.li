"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/admin/confirm-dialog"
import { RotateCcw, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
    restoreDrop,
    hardDeleteDrop,
    restoreForm,
    hardDeleteForm,
    toggleAlias,
    deleteAlias,
} from "@/actions/admin"

interface TakedownItem {
    type: "drop" | "form" | "alias"
    id: string
}

const LABELS = { drop: "Drop", form: "Form", alias: "Alias" } as const

function restore(item: TakedownItem) {
    if (item.type === "drop") return restoreDrop(item.id)
    if (item.type === "form") return restoreForm(item.id)
    // Admin re-activation is the alias takedown restore (clears the marker
    // and removes the strike).
    return toggleAlias(item.id, true)
}

function remove(item: TakedownItem) {
    if (item.type === "drop") return hardDeleteDrop(item.id)
    if (item.type === "form") return hardDeleteForm(item.id)
    return deleteAlias(item.id)
}

const RESTORE_DESCRIPTIONS = {
    drop: "This will restore the drop and make it accessible again, and remove the owner's ToS strike for it.",
    form: "This will restore the form (respecting the owner's own open/closed setting), and remove the owner's ToS strike for it.",
    alias: "This will re-activate the alias so mail forwards again, and remove the owner's ToS strike for it.",
} as const

const DELETE_DESCRIPTIONS = {
    drop: "This will permanently delete the drop and all its files. This action cannot be undone.",
    form: "This will permanently delete the form, its submissions, and attached files. This action cannot be undone.",
    alias: "This will permanently delete the alias. This action cannot be undone.",
} as const

export function TakedownActions({ item }: { item: TakedownItem }) {
    const router = useRouter()
    const [showRestoreDialog, setShowRestoreDialog] = useState(false)
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const [loading, setLoading] = useState(false)
    const label = LABELS[item.type]

    const run = async (fn: () => Promise<{ error?: string }>, success: string, failure: string) => {
        setLoading(true)
        try {
            const result = await fn()
            if (result.error) {
                throw new Error(result.error)
            }
            toast.success(success)
            router.refresh()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : failure)
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
                title={`Restore ${label}`}
                description={RESTORE_DESCRIPTIONS[item.type]}
                confirmLabel="Restore"
                variant="default"
                onConfirm={() => run(() => restore(item), `${label} restored successfully`, `Failed to restore ${item.type}`)}
                loading={loading}
            />

            <ConfirmDialog
                open={showDeleteDialog}
                onOpenChange={setShowDeleteDialog}
                title={`Permanently Delete ${label}`}
                description={DELETE_DESCRIPTIONS[item.type]}
                confirmLabel="Delete Forever"
                onConfirm={() => run(() => remove(item), `${label} permanently deleted`, `Failed to delete ${item.type}`)}
                loading={loading}
            />
        </>
    )
}
