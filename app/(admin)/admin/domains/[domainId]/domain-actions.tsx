"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/admin/confirm-dialog"
import { CheckCircle, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { forceVerifyDomain, deleteDomain } from "@/actions/admin"

interface Domain {
    id: string
    domain: string
    verified: boolean
}

export function DomainActions({ domain }: { domain: Domain }) {
    const router = useRouter()
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const [showVerifyDialog, setShowVerifyDialog] = useState(false)
    const [loading, setLoading] = useState(false)

    const handleForceVerify = async () => {
        setLoading(true)
        try {
            const result = await forceVerifyDomain(domain.id)

            if (result.error) {
                throw new Error(result.error)
            }

            toast.success("Domain verified successfully")
            router.refresh()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to verify domain")
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async () => {
        setLoading(true)
        try {
            const result = await deleteDomain(domain.id)

            if (result.error) {
                throw new Error(result.error)
            }

            toast.success("Domain deleted successfully")
            router.push("/admin/domains")
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to delete domain")
        } finally {
            setLoading(false)
        }
    }

    return (
        <>
            <div className="flex gap-2">
                {!domain.verified && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowVerifyDialog(true)}
                    >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Force Verify
                    </Button>
                )}
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
                open={showVerifyDialog}
                onOpenChange={setShowVerifyDialog}
                title="Force Verify Domain"
                description={`This will mark ${domain.domain} as fully verified, bypassing all DNS checks. Use this only if you've manually confirmed domain ownership.`}
                confirmLabel="Force Verify"
                variant="default"
                onConfirm={handleForceVerify}
                loading={loading}
            />

            <ConfirmDialog
                open={showDeleteDialog}
                onOpenChange={setShowDeleteDialog}
                title="Delete Domain"
                description={`Are you sure you want to delete ${domain.domain}? This action cannot be undone. Aliases using this domain will remain but may stop working.`}
                confirmLabel="Delete Domain"
                onConfirm={handleDelete}
                loading={loading}
            />
        </>
    )
}
