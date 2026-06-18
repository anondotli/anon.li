"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { ConfirmDialog } from "@/components/admin/confirm-dialog"
import { ShieldAlert } from "lucide-react"
import { toast } from "sonner"
import {
    setUserAdmin,
    setUserStorageLimit,
    resetUser2FA,
    setUserStrikes,
    warnUser,
} from "@/actions/admin"

const GB = 1024 * 1024 * 1024

interface UserManagePanelProps {
    user: {
        id: string
        email: string
        isAdmin: boolean
        twoFactorEnabled: boolean
        tosViolations: number
        /** Raw per-user storage grant column, in bytes (string). */
        storageLimitGrant: string
    }
}

export function UserManagePanel({ user }: UserManagePanelProps) {
    const router = useRouter()
    const [loading, setLoading] = useState(false)

    const [storageGb, setStorageGb] = useState(() => (Number(user.storageLimitGrant) / GB).toString())
    const [strikes, setStrikes] = useState(user.tosViolations.toString())
    const [showReset2FA, setShowReset2FA] = useState(false)
    const [showWarn, setShowWarn] = useState(false)
    const [warnReason, setWarnReason] = useState("")

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

    const handleSaveStorage = () => {
        const gb = Number(storageGb)
        if (!Number.isFinite(gb) || gb < 0) {
            toast.error("Enter a valid storage amount in GB")
            return
        }
        void run(() => setUserStorageLimit(user.id, Math.round(gb * GB)), "Storage grant updated")
    }

    const handleSaveStrikes = () => {
        const value = parseInt(strikes, 10)
        if (!Number.isInteger(value) || value < 0) {
            toast.error("Enter a valid strike count")
            return
        }
        void run(() => setUserStrikes(user.id, value), "Strikes updated")
    }

    const handleWarn = async () => {
        if (warnReason.trim().length === 0) {
            toast.error("Enter a warning reason")
            return
        }
        const ok = await run(() => warnUser(user.id, warnReason.trim()), "Warning email sent")
        if (ok) {
            setShowWarn(false)
            setWarnReason("")
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Manage Account</CardTitle>
                <CardDescription>Privileged account controls. Every action is audit-logged.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Admin access */}
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <Label className="font-medium">Platform admin</Label>
                        <p className="text-sm text-muted-foreground">Grants full access to this admin panel.</p>
                    </div>
                    <Switch
                        checked={user.isAdmin}
                        disabled={loading}
                        onCheckedChange={(checked) =>
                            run(() => setUserAdmin(user.id, checked), checked ? "Admin access granted" : "Admin access revoked")
                        }
                    />
                </div>

                <Separator />

                {/* Storage grant */}
                <div className="space-y-2">
                    <Label htmlFor="storage-grant" className="font-medium">Storage grant (GB)</Label>
                    <p className="text-sm text-muted-foreground">
                        Effective storage is the greater of the plan limit and this grant.
                    </p>
                    <div className="flex gap-2">
                        <Input
                            id="storage-grant"
                            type="number"
                            min={0}
                            step="0.5"
                            value={storageGb}
                            onChange={(e) => setStorageGb(e.target.value)}
                            className="max-w-[160px]"
                        />
                        <Button variant="secondary" onClick={handleSaveStorage} disabled={loading}>
                            Save
                        </Button>
                    </div>
                </div>

                <Separator />

                {/* Strikes */}
                <div className="space-y-2">
                    <Label htmlFor="strikes" className="font-medium">ToS strikes</Label>
                    <p className="text-sm text-muted-foreground">Auto-ban triggers at 3 strikes.</p>
                    <div className="flex gap-2">
                        <Input
                            id="strikes"
                            type="number"
                            min={0}
                            value={strikes}
                            onChange={(e) => setStrikes(e.target.value)}
                            className="max-w-[120px]"
                        />
                        <Button variant="secondary" onClick={handleSaveStrikes} disabled={loading}>
                            Save
                        </Button>
                    </div>
                </div>

                <Separator />

                {/* 2FA + warning */}
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => setShowWarn(true)} disabled={loading}>
                        <ShieldAlert className="h-4 w-4" />
                        Send warning
                    </Button>
                    {user.twoFactorEnabled && (
                        <Button variant="outline" onClick={() => setShowReset2FA(true)} disabled={loading}>
                            Reset 2FA
                        </Button>
                    )}
                </div>
            </CardContent>

            <ConfirmDialog
                open={showReset2FA}
                onOpenChange={setShowReset2FA}
                title="Reset two-factor authentication"
                description={`Disable 2FA for ${user.email} and delete their TOTP secret. They will be able to sign in without a second factor until they re-enroll. Use only after identity verification.`}
                confirmLabel="Reset 2FA"
                onConfirm={async () => {
                    await run(() => resetUser2FA(user.id), "2FA reset")
                }}
                loading={loading}
            />

            <Dialog open={showWarn} onOpenChange={setShowWarn}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Send warning email</DialogTitle>
                        <DialogDescription>Email a policy warning to {user.email}.</DialogDescription>
                    </DialogHeader>
                    <Textarea
                        placeholder="Describe the policy concern…"
                        value={warnReason}
                        onChange={(e) => setWarnReason(e.target.value)}
                        rows={4}
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowWarn(false)} disabled={loading}>
                            Cancel
                        </Button>
                        <Button onClick={handleWarn} disabled={loading}>
                            {loading ? "Sending…" : "Send warning"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    )
}
