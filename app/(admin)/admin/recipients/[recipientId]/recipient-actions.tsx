"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/admin/confirm-dialog"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"
import { deleteRecipient } from "@/actions/admin"

interface Recipient {
    id: string
    email: string
}

export function RecipientActions({ recipient }: { recipient: Recipient }) {
    const router = useRouter()
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const [loading, setLoading] = useState(false)

    const handleDelete = async () => {
        setLoading(true)
        try {
            const result = await deleteRecipient(recipient.id)

            if (result.error) {
                throw new Error(result.error)
            }

            toast.success("Recipient deleted successfully")
            router.push("/admin/recipients")
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to delete recipient")
        } finally {
            setLoading(false)
        }
    }

    return (
        <>
            <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteDialog(true)}
            >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
            </Button>

            <ConfirmDialog
                open={showDeleteDialog}
                onOpenChange={setShowDeleteDialog}
                title="Delete Recipient"
                description={`Are you sure you want to delete ${recipient.email}? Aliases using this recipient will have their forwarding broken.`}
                confirmLabel="Delete Recipient"
                onConfirm={handleDelete}
                loading={loading}
            />
        </>
    )
}
