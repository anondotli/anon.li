"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/admin/confirm-dialog"
import { Ban, CheckCircle2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { setOauthAppDisabled, deleteOauthApp } from "@/actions/admin"

interface OauthAppActionsProps {
    app: { id: string; name: string; disabled: boolean }
    /** Detail view shows full-width labeled buttons; the table shows compact icons. */
    variant?: "compact" | "full"
}

export function OauthAppActions({ app, variant = "compact" }: OauthAppActionsProps) {
    const router = useRouter()
    const [showDelete, setShowDelete] = useState(false)
    const [showToggle, setShowToggle] = useState(false)
    const [loading, setLoading] = useState(false)

    const isFull = variant === "full"

    const run = async (fn: () => Promise<{ error?: string }>, success: string, redirectTo?: string) => {
        setLoading(true)
        try {
            const result = await fn()
            if (result.error) throw new Error(result.error)
            toast.success(success)
            if (redirectTo) router.push(redirectTo)
            else router.refresh()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Action failed")
        } finally {
            setLoading(false)
        }
    }

    return (
        <>
            <div className={isFull ? "flex flex-wrap gap-2" : "flex justify-end gap-1"}>
                <Button
                    variant={isFull ? "outline" : "ghost"}
                    size="sm"
                    onClick={(e) => {
                        e.stopPropagation()
                        setShowToggle(true)
                    }}
                >
                    {app.disabled ? <CheckCircle2 className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                    {isFull && <span>{app.disabled ? "Enable" : "Disable"}</span>}
                </Button>
                <Button
                    variant={isFull ? "destructive" : "ghost"}
                    size="sm"
                    className={isFull ? undefined : "text-destructive hover:text-destructive"}
                    onClick={(e) => {
                        e.stopPropagation()
                        setShowDelete(true)
                    }}
                >
                    <Trash2 className="h-4 w-4" />
                    {isFull && <span>Delete</span>}
                </Button>
            </div>

            <ConfirmDialog
                open={showToggle}
                onOpenChange={setShowToggle}
                title={app.disabled ? "Enable application" : "Disable application"}
                description={
                    app.disabled
                        ? `Re-enable "${app.name}". Clients will be able to obtain new tokens again.`
                        : `Disable "${app.name}". New authorizations will be blocked. Existing access tokens remain valid until they expire.`
                }
                confirmLabel={app.disabled ? "Enable" : "Disable"}
                variant={app.disabled ? "default" : "destructive"}
                onConfirm={() => run(() => setOauthAppDisabled(app.id, !app.disabled), app.disabled ? "Application enabled" : "Application disabled")}
                loading={loading}
            />

            <ConfirmDialog
                open={showDelete}
                onOpenChange={setShowDelete}
                title="Delete application"
                description={`Permanently delete "${app.name}" and revoke all of its access tokens and consents. This cannot be undone.`}
                confirmLabel="Delete"
                onConfirm={() => run(() => deleteOauthApp(app.id), "Application deleted", isFull ? "/admin/oauth" : undefined)}
                loading={loading}
            />
        </>
    )
}
