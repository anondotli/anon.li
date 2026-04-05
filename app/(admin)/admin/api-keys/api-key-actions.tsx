"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/admin/confirm-dialog"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"
import { revokeApiKey } from "@/actions/admin"

interface ApiKey {
    id: string
    keyPrefix: string
}

export function ApiKeyActions({ apiKey }: { apiKey: ApiKey }) {
    const router = useRouter()
    const [showRevokeDialog, setShowRevokeDialog] = useState(false)
    const [loading, setLoading] = useState(false)

    const handleRevoke = async () => {
        setLoading(true)
        try {
            const result = await revokeApiKey(apiKey.id)

            if (result.error) {
                throw new Error(result.error)
            }

            toast.success("API key revoked successfully")
            router.refresh()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to revoke API key")
        } finally {
            setLoading(false)
        }
    }

    return (
        <>
            <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={(e) => {
                    e.stopPropagation()
                    setShowRevokeDialog(true)
                }}
            >
                <Trash2 className="h-4 w-4" />
            </Button>

            <ConfirmDialog
                open={showRevokeDialog}
                onOpenChange={setShowRevokeDialog}
                title="Revoke API Key"
                description={`Are you sure you want to revoke the API key starting with ${apiKey.keyPrefix}? This will immediately invalidate the key and any applications using it will lose access.`}
                confirmLabel="Revoke Key"
                onConfirm={handleRevoke}
                loading={loading}
            />
        </>
    )
}
