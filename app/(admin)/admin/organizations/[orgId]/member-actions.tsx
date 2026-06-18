"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/admin/confirm-dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"
import { updateOrgMemberRole, removeOrgMember, cancelOrgInvitation } from "@/actions/admin"

type Role = "owner" | "admin" | "member"

function useRunner() {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const run = async (fn: () => Promise<{ error?: string }>, success: string) => {
        setLoading(true)
        try {
            const result = await fn()
            if (result.error) throw new Error(result.error)
            toast.success(success)
            router.refresh()
            return true
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Action failed")
            return false
        } finally {
            setLoading(false)
        }
    }
    return { loading, run }
}

export function MemberActions({
    organizationId,
    member,
}: {
    organizationId: string
    member: { userId: string; role: string; email: string }
}) {
    const { loading, run } = useRunner()
    const [showRemove, setShowRemove] = useState(false)

    return (
        <div className="flex items-center justify-end gap-2">
            <Select
                value={member.role}
                disabled={loading}
                onValueChange={(role) =>
                    run(() => updateOrgMemberRole(organizationId, member.userId, role as Role), "Role updated")
                }
            >
                <SelectTrigger className="h-8 w-28">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="owner">Owner</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="member">Member</SelectItem>
                </SelectContent>
            </Select>

            <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={loading}
                onClick={() => setShowRemove(true)}
            >
                <Trash2 className="h-4 w-4" />
            </Button>

            <ConfirmDialog
                open={showRemove}
                onOpenChange={setShowRemove}
                title="Remove member"
                description={`Remove ${member.email} from this organization, delete their wrapped vault key, and flag key rotation.`}
                confirmLabel="Remove member"
                onConfirm={async () => {
                    await run(() => removeOrgMember(organizationId, member.userId), "Member removed")
                }}
                loading={loading}
            />
        </div>
    )
}

export function InvitationCancel({ invitationId, email }: { invitationId: string; email: string }) {
    const { loading, run } = useRunner()
    const [showCancel, setShowCancel] = useState(false)

    return (
        <>
            <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={loading}
                onClick={() => setShowCancel(true)}
            >
                <Trash2 className="h-4 w-4" />
            </Button>
            <ConfirmDialog
                open={showCancel}
                onOpenChange={setShowCancel}
                title="Cancel invitation"
                description={`Cancel the pending invitation to ${email}.`}
                confirmLabel="Cancel invitation"
                onConfirm={async () => {
                    await run(() => cancelOrgInvitation(invitationId), "Invitation canceled")
                }}
                loading={loading}
            />
        </>
    )
}
