"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/admin/confirm-dialog"
import { Trash2, ToggleLeft, ToggleRight } from "lucide-react"
import { toast } from "sonner"
import { toggleAlias, deleteAlias } from "@/actions/admin"

interface Alias {
    id: string
    email: string
    active: boolean
}

export function AliasActions({ alias }: { alias: Alias }) {
    const router = useRouter()
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const [showToggleDialog, setShowToggleDialog] = useState(false)
    const [loading, setLoading] = useState(false)

    const handleToggle = async () => {
        setLoading(true)
        try {
            const result = await toggleAlias(alias.id, !alias.active)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success(`Alias ${alias.active ? "disabled" : "enabled"} successfully`)
                router.refresh()
            }
        } catch {
            toast.error("Failed to update alias")
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async () => {
        setLoading(true)
        try {
            const result = await deleteAlias(alias.id)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success("Alias deleted successfully")
                router.push("/admin/aliases")
            }
        } catch {
            toast.error("Failed to delete alias")
        } finally {
            setLoading(false)
        }
    }

    return (
        <>
            <div className="flex gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowToggleDialog(true)}
                >
                    {alias.active ? (
                        <>
                            <ToggleRight className="h-4 w-4 mr-2" />
                            Disable
                        </>
                    ) : (
                        <>
                            <ToggleLeft className="h-4 w-4 mr-2" />
                            Enable
                        </>
                    )}
                </Button>
                <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowDeleteDialog(true)}
                >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                </Button>
            </div>

            <ConfirmDialog
                open={showToggleDialog}
                onOpenChange={setShowToggleDialog}
                title={alias.active ? "Disable Alias" : "Enable Alias"}
                description={
                    alias.active
                        ? `This will stop forwarding emails to ${alias.email}. The alias will remain reserved.`
                        : `This will resume forwarding emails to ${alias.email}.`
                }
                confirmLabel={alias.active ? "Disable" : "Enable"}
                variant={alias.active ? "destructive" : "default"}
                onConfirm={handleToggle}
                loading={loading}
            />

            <ConfirmDialog
                open={showDeleteDialog}
                onOpenChange={setShowDeleteDialog}
                title="Delete Alias"
                description={`Are you sure you want to delete ${alias.email}? This action cannot be undone and the alias will become available for others to claim.`}
                confirmLabel="Delete Alias"
                onConfirm={handleDelete}
                loading={loading}
            />
        </>
    )
}
