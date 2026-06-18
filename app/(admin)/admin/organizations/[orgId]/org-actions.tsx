"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ConfirmDialog } from "@/components/admin/confirm-dialog"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Ban, CheckCircle, KeyRound, ShieldCheck, ShieldOff, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
    suspendOrganization,
    unsuspendOrganization,
    deleteOrganization,
    setOrgEnforce2FA,
    recommendOrgKeyRotation,
} from "@/actions/admin"

interface OrgActionsProps {
    org: { id: string; name: string; enforce2FA: boolean; suspended: boolean }
}

export function OrgActions({ org }: OrgActionsProps) {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [showSuspend, setShowSuspend] = useState(false)
    const [showUnsuspend, setShowUnsuspend] = useState(false)
    const [showDelete, setShowDelete] = useState(false)
    const [showRotate, setShowRotate] = useState(false)
    const [suspendReason, setSuspendReason] = useState("")

    const run = async (fn: () => Promise<{ error?: string }>, success: string, redirectTo?: string) => {
        setLoading(true)
        try {
            const result = await fn()
            if (result.error) throw new Error(result.error)
            toast.success(success)
            if (redirectTo) router.push(redirectTo)
            else router.refresh()
            return true
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Action failed")
            return false
        } finally {
            setLoading(false)
        }
    }

    const handleSuspend = async () => {
        if (suspendReason.trim().length === 0) {
            toast.error("Enter a suspension reason")
            return
        }
        const ok = await run(() => suspendOrganization(org.id, suspendReason.trim()), "Organization suspended")
        if (ok) {
            setShowSuspend(false)
            setSuspendReason("")
        }
    }

    return (
        <>
            <div className="flex flex-wrap items-center gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    disabled={loading}
                    onClick={() => run(() => setOrgEnforce2FA(org.id, !org.enforce2FA), org.enforce2FA ? "2FA enforcement disabled" : "2FA enforcement enabled")}
                >
                    {org.enforce2FA ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                    {org.enforce2FA ? "Disable 2FA" : "Enforce 2FA"}
                </Button>

                <Button variant="outline" size="sm" disabled={loading} onClick={() => setShowRotate(true)}>
                    <KeyRound className="h-4 w-4" />
                    Recommend rotation
                </Button>

                {org.suspended ? (
                    <Button variant="outline" size="sm" disabled={loading} onClick={() => setShowUnsuspend(true)}>
                        <CheckCircle className="h-4 w-4" />
                        Unsuspend
                    </Button>
                ) : (
                    <Button variant="outline" size="sm" disabled={loading} onClick={() => setShowSuspend(true)}>
                        <Ban className="h-4 w-4" />
                        Suspend
                    </Button>
                )}

                <Button variant="destructive" size="sm" disabled={loading} onClick={() => setShowDelete(true)}>
                    <Trash2 className="h-4 w-4" />
                    Delete
                </Button>
            </div>

            <Dialog open={showSuspend} onOpenChange={setShowSuspend}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Suspend organization</DialogTitle>
                        <DialogDescription>
                            Freeze “{org.name}”. Members will be blocked from org-scoped writes until it is unsuspended.
                        </DialogDescription>
                    </DialogHeader>
                    <Textarea
                        placeholder="Reason for suspension…"
                        value={suspendReason}
                        onChange={(e) => setSuspendReason(e.target.value)}
                        rows={3}
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowSuspend(false)} disabled={loading}>Cancel</Button>
                        <Button variant="destructive" onClick={handleSuspend} disabled={loading}>
                            {loading ? "Suspending…" : "Suspend"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={showUnsuspend}
                onOpenChange={setShowUnsuspend}
                title="Unsuspend organization"
                description={`Restore normal access for “${org.name}”.`}
                confirmLabel="Unsuspend"
                variant="default"
                onConfirm={async () => {
                    await run(() => unsuspendOrganization(org.id), "Organization unsuspended")
                }}
                loading={loading}
            />

            <ConfirmDialog
                open={showRotate}
                onOpenChange={setShowRotate}
                title="Recommend key rotation"
                description={`Flag “${org.name}” for org vault key rotation. Owners will see a rotation banner until they rotate.`}
                confirmLabel="Recommend rotation"
                variant="default"
                onConfirm={async () => {
                    await run(() => recommendOrgKeyRotation(org.id), "Key rotation recommended")
                }}
                loading={loading}
            />

            <ConfirmDialog
                open={showDelete}
                onOpenChange={setShowDelete}
                title="Delete organization"
                description={`Permanently delete “${org.name}”, all of its members, invitations, and org-owned resources. Org-owned drop files are queued for storage cleanup. This cannot be undone.`}
                confirmLabel="Delete organization"
                onConfirm={async () => {
                    await run(() => deleteOrganization(org.id), "Organization deleted", "/admin/organizations")
                }}
                loading={loading}
            />
        </>
    )
}
